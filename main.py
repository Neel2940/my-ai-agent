import os
import urllib.parse
import random
import re
import datetime # NEW: Gives the AI a concept of real time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from duckduckgo_search import DDGS

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MessageItem(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[MessageItem]

@app.get("/")
def home():
    return {"status": "Backend is running with real-time streaming!"}

@app.post("/smart_chat")
def smart_chat(req: ChatRequest):
    if not req.messages:
        return {"response": "No message history provided."}

    history = [{"role": m.role, "content": m.content} for m in req.messages]
    latest_msg = history[-1]["content"].strip()
    latest_msg_lower = latest_msg.lower()
    
    # Get the exact current date to prevent AI time hallucinations
    current_date = datetime.datetime.now().strftime("%B %Y")

    api_key = os.environ.get("GROQ_API_KEY")
    client = Groq(api_key=api_key) if api_key else None

    seen_image_urls = set()
    for msg in history:
        if msg["role"] == "assistant":
            urls = re.findall(r'!\[IMAGE\]\((.*?)\)', msg["content"])
            for url in urls:
                seen_image_urls.add(url)

    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "Here is a real picture" in history[-2]["content"] or "Here are your pictures" in history[-2]["content"]

    image_keywords = ["image", "photo", "picture", "pic", "img", "generate", "draw", "create", "paint", "show me"]
    is_image_request = any(k in latest_msg_lower for k in image_keywords) or (
        prev_was_image and not any(k in latest_msg_lower for k in ["explain", "who is", "what is", "tell me", "why"])
    )

    # ---------------------------------------------------------
    # ROUTE 1: AI ART GENERATION
    # ---------------------------------------------------------
    if any(k in latest_msg_lower for k in ["generate", "draw", "create", "paint"]):
        prompt_encoded = urllib.parse.quote_plus(latest_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        def generate_art():
            yield f"Here is your generated AI image:\n\n{img_markdown}"
        return StreamingResponse(generate_art(), media_type="text/event-stream")

    # ---------------------------------------------------------
    # ROUTE 2: REAL WEB PHOTOS 
    # ---------------------------------------------------------
    elif is_image_request:
        search_query = latest_msg
        
        num_images = 1
        if any(w in latest_msg_lower for w in ["two", "2"]): num_images = 2
        elif any(w in latest_msg_lower for w in ["three", "3"]): num_images = 3
        elif any(w in latest_msg_lower for w in ["four", "4"]): num_images = 4
        elif any(w in latest_msg_lower for w in ["five", "5", "some", "few", "more", "multiple", "another"]): num_images = 3
        
        if client and (len(latest_msg.split()) < 8 or prev_was_image):
            try:
                refinement = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=history + [
                        {"role": "system", "content": "You are a strict search term extractor. Output ONLY the exact name of the person or thing the user wants to see (1 to 5 words). DO NOT write sentences."}
                    ],
                    temperature=0.1
                )
                extracted = refinement.choices[0].message.content.strip()
                if "sorry" not in extracted.lower() and "provide" not in extracted.lower() and "cannot" not in extracted.lower():
                    search_query = extracted
            except Exception:
                pass

        remove_phrases = ["give me", "show me", "an image of", "the image of", "a picture of", "picture of", "image of", "photo of", "images of", "pictures of", "i want", "some", "few", "more", "two", "three", "four", "five", "1", "2", "3", "4", "5", "image", "photo", "picture", "images", "pics", "another", "different", "new"]
        clean_search = search_query.lower()
        for phrase in remove_phrases:
            clean_search = clean_search.replace(phrase, "")
        clean_search = clean_search.strip() or search_query

        combined_images = ""
        try:
            results = DDGS().images(clean_search, max_results=50)
            if results:
                fresh_images = [res for res in results if res['image'] not in seen_image_urls]
                if len(fresh_images) >= num_images:
                    random.shuffle(fresh_images)
                    img_markdowns = [f"![IMAGE]({res['image']})" for res in fresh_images[:num_images]]
                    combined_images = "\n\n".join(img_markdowns)
        except Exception:
            pass 
            
        if not combined_images:
            img_markdowns = []
            modifiers = ["", " portrait", " high quality", " close up", " photography", " action", " field", " 4k", " match", " smiling", " latest", " news", " celebration", " profile"]
            random.shuffle(modifiers)
            
            added = 0
            for mod in modifiers:
                if added >= num_images: break
                modified_query = clean_search + mod
                query_encoded = urllib.parse.quote_plus(modified_query)
                cdn = (added % 4) + 1 
                img_url = f"https://tse{cdn}.mm.bing.net/th?q={query_encoded}"
                if img_url not in seen_image_urls:
                    img_markdowns.append(f"![IMAGE]({img_url})")
                    seen_image_urls.add(img_url)
                    added += 1
            combined_images = "\n\n".join(img_markdowns)

        def generate_images():
            yield f"Here are your completely new pictures of {clean_search}:\n\n{combined_images}"
        # CHANGED to text/event-stream for zero buffering
        return StreamingResponse(generate_images(), media_type="text/event-stream")

    # ---------------------------------------------------------
    # ROUTE 3: LIVE WEB SEARCH (Expanded keywords + Strict Anti-Hallucination)
    # ---------------------------------------------------------
    elif any(keyword in latest_msg_lower for keyword in [
        "search", "latest", "news", "real time", "current", "today", 
        "squad", "roster", "won", "score", "price of", "2024", "2025", "2026", "2027", "now", "players", "team"
    ]):
        if not client:
            return StreamingResponse(iter(["⚠️ ERROR: GROQ_API_KEY missing."]), media_type="text/event-stream")
        
        def generate_live():
            try:
                results = DDGS().text(latest_msg, max_results=3)
                live_info = "\n".join([f"- {res['title']}: {res['body']}" for res in results])
                
                # 🚀 NEW: Strict system prompt enforcing the current date
                strict_system_prompt = (
                    f"Current Date: {current_date}. You have real-time internet access. "
                    f"NEVER say you have a knowledge cutoff. "
                    f"Answer the user's prompt intelligently using ONLY this live web data:\n\n{live_info}"
                )
                
                stream = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[{"role": "system", "content": strict_system_prompt}] + history,
                    temperature=0.4,
                    stream=True
                )
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"⚠️ Live Search Error: {str(e)}"
        
        return StreamingResponse(generate_live(), media_type="text/event-stream")

    # ---------------------------------------------------------
    # ROUTE 4: STANDARD CHATGPT TEXT 
    # ---------------------------------------------------------
    else:
        if not client:
            return StreamingResponse(iter(["⚠️ ERROR: GROQ_API_KEY missing."]), media_type="text/event-stream")
        
        def generate_chat():
            try:
                # 🚀 NEW: Ensures normal chat also knows the current year
                system_instruction = [{"role": "system", "content": f"Current Date: {current_date}. You are a helpful AI assistant. Maintain context."}]
                stream = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=system_instruction + history,
                    temperature=0.7,
                    stream=True
                )
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"⚠️ API ERROR: {str(e)}"
        
        return StreamingResponse(generate_chat(), media_type="text/event-stream")