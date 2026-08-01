import os
import urllib.parse
import random
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
    return {"status": "Backend is running and ready for multi-turn chat!"}

@app.post("/smart_chat")
def smart_chat(req: ChatRequest):
    if not req.messages:
        return {"response": "No message history provided."}

    history = [{"role": m.role, "content": m.content} for m in req.messages]
    latest_msg = history[-1]["content"].strip()
    latest_msg_lower = latest_msg.lower()

    api_key = os.environ.get("GROQ_API_KEY")
    client = Groq(api_key=api_key) if api_key else None

    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "Here is a real picture" in history[-2]["content"] or "Here are your pictures" in history[-2]["content"]

    image_keywords = ["image", "photo", "picture", "pic", "img", "generate", "draw", "create", "paint", "show me"]
    is_image_request = any(k in latest_msg_lower for k in image_keywords) or (
        prev_was_image and not any(k in latest_msg_lower for k in ["explain", "who is", "what is", "tell me", "why"])
    )

    if any(k in latest_msg_lower for k in ["generate", "draw", "create", "paint"]):
        prompt_encoded = urllib.parse.quote_plus(latest_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        return {"response": f"Here is your generated AI image:\n\n{img_markdown}"}

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
                        {"role": "system", "content": "You are a strict search term extractor. Output ONLY the exact name of the person or thing the user wants to see (1 to 5 words). DO NOT write sentences. Ignore words like 'more', 'another', or 'different'."}
                    ],
                    temperature=0.1
                )
                extracted = refinement.choices[0].message.content.strip()
                if "sorry" not in extracted.lower() and "provide" not in extracted.lower() and "cannot" not in extracted.lower():
                    search_query = extracted
            except Exception:
                pass

        remove_phrases = ["give me", "show me", "an image of", "the image of", "a picture of", "picture of", "image of", "photo of", "images of", "pictures of", "i want", "some", "few", "more", "two", "three", "four", "five", "1", "2", "3", "4", "5", "image", "photo", "picture", "images", "pics", "another", "different"]
        clean_search = search_query.lower()
        for phrase in remove_phrases:
            clean_search = clean_search.replace(phrase, "")
        clean_search = clean_search.strip() or search_query

        combined_images = ""
        try:
            # 🚀 NEW: Grab 15 images and shuffle them to guarantee variety!
            results = DDGS().images(clean_search, max_results=15)
            if results and len(results) >= num_images:
                random.shuffle(results)
                img_markdowns = [f"![IMAGE]({res['image']})" for res in results[:num_images]]
                combined_images = "\n\n".join(img_markdowns)
        except Exception:
            pass 
            
        if not combined_images:
            img_markdowns = []
            # 🚀 NEW: Shuffled Bing trick keywords for total randomness
            modifiers = ["", " portrait", " high quality", " close up", " photography", " action", " field", " 4k", " match", " smiling"]
            random.shuffle(modifiers)
            
            for i in range(num_images):
                modified_query = clean_search + modifiers[i % len(modifiers)]
                query_encoded = urllib.parse.quote_plus(modified_query)
                cdn = (i % 4) + 1 
                img_url = f"https://tse{cdn}.mm.bing.net/th?q={query_encoded}"
                img_markdowns.append(f"![IMAGE]({img_url})")
            
            combined_images = "\n\n".join(img_markdowns)

        return {"response": f"Here are your pictures of {clean_search}:\n\n{combined_images}"}

    elif any(keyword in latest_msg_lower for keyword in [
        "search the web", "latest news", "real time", "current", "today", 
        "squad", "roster", "who won", "score", "price of", "2024", "2025", "2026", "now"
    ]):
        if not client:
            return {"response": "⚠️ ERROR: Your GROQ_API_KEY is missing on Render."}
        try:
            results = DDGS().text(latest_msg, max_results=3)
            live_info = "\n".join([f"- {res['title']}: {res['body']}" for res in results])
            
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": f"You are a helpful AI assistant. Answer using ONLY this live, up-to-date search data:\n\n{live_info}"}
                ] + history,
                temperature=0.5
            )
            return {"response": completion.choices[0].message.content}
        except Exception as e:
            return {"response": f"⚠️ Live Search Error: {str(e)}"}

    else:
        if not client:
            return {"response": "⚠️ ERROR: Your GROQ_API_KEY is missing on Render."}
        try:
            system_instruction = [{"role": "system", "content": "You are a helpful, intelligent AI assistant like ChatGPT. Maintain context from previous messages in the conversation."}]
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=system_instruction + history,
                temperature=0.7
            )
            return {"response": completion.choices[0].message.content}
        except Exception as e:
            return {"response": f"⚠️ API ERROR: {str(e)}"}