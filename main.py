import os
import urllib.parse
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

    # Extract conversation history
    history = [{"role": m.role, "content": m.content} for m in req.messages]
    latest_msg = history[-1]["content"].strip()
    latest_msg_lower = latest_msg.lower()

    api_key = os.environ.get("GROQ_API_KEY")
    client = Groq(api_key=api_key) if api_key else None

    # Check if previous response was an image
    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "Here is a real picture" in history[-2]["content"] or "Here are your pictures" in history[-2]["content"]

    # Detect if user wants an image (explicitly or via contextual follow-up)
    image_keywords = ["image", "photo", "picture", "pic", "img", "generate", "draw", "create", "paint", "show me"]
    is_image_request = any(k in latest_msg_lower for k in image_keywords) or (
        prev_was_image and not any(k in latest_msg_lower for k in ["explain", "who is", "what is", "tell me"])
    )

    # ---------------------------------------------------------
    # ROUTE 1: AI ART GENERATION (Only for "generate", "draw", "paint")
    # ---------------------------------------------------------
    if any(k in latest_msg_lower for k in ["generate", "draw", "create", "paint"]):
        prompt_encoded = urllib.parse.quote_plus(latest_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        return {"response": f"Here is your generated AI image:\n\n{img_markdown}"}

    # ---------------------------------------------------------
    # ROUTE 2: REAL WEB PHOTOS (Now supports multiple images!)
    # ---------------------------------------------------------
    elif is_image_request:
        search_query = latest_msg
        
        # Determine how many images the user wants
        num_images = 1
        if any(w in latest_msg_lower for w in ["two", "2"]): num_images = 2
        elif any(w in latest_msg_lower for w in ["three", "3"]): num_images = 3
        elif any(w in latest_msg_lower for w in ["four", "4"]): num_images = 4
        elif any(w in latest_msg_lower for w in ["five", "5", "some", "few", "more"]): num_images = 3
        
        # Strict keyword extraction to bypass AI safety refusals
        if client and (len(latest_msg.split()) < 8 or prev_was_image):
            try:
                refinement = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=history + [
                        {"role": "system", "content": "You are a strict search term extractor. The user wants to see a photo. Output ONLY the exact name of the person or thing they want to see (1 to 5 words). DO NOT write sentences. DO NOT write safety refusals like 'I cannot provide'."}
                    ],
                    temperature=0.1
                )
                extracted = refinement.choices[0].message.content.strip()
                # Double check the AI didn't still output a refusal
                if "sorry" not in extracted.lower() and "provide" not in extracted.lower() and "cannot" not in extracted.lower():
                    search_query = extracted
            except Exception:
                pass

        # Clean conversational filler phrases out of the search query
        remove_phrases = ["give me", "show me", "an image of", "the image of", "a picture of", "picture of", "image of", "photo of", "images of", "pictures of", "i want", "some", "few", "more", "two", "three", "four", "five", "1", "2", "3", "4", "5", "image", "photo", "picture", "images", "pics"]
        clean_search = search_query.lower()
        for phrase in remove_phrases:
            clean_search = clean_search.replace(phrase, "")
        clean_search = clean_search.strip() or search_query

        # Use DuckDuckGo to grab multiple high-quality real images!
        try:
            results = DDGS().images(clean_search, max_results=num_images)
            if results and len(results) > 0:
                img_markdowns = [f"![IMAGE]({res['image']})" for res in results]
                combined_images = "\n\n".join(img_markdowns)
                return {"response": f"Here are your pictures of {clean_search}:\n\n{combined_images}"}
        except Exception:
            pass # If DDG fails, it will fall down to the Bing fallback below
            
        # Fallback to single Bing Image if DuckDuckGo gets blocked
        query_encoded = urllib.parse.quote_plus(clean_search)
        real_img_url = f"https://tse1.mm.bing.net/th?q={query_encoded}"
        return {"response": f"Here is a real picture of {clean_search}:\n\n![IMAGE]({real_img_url})"}

    # ---------------------------------------------------------
    # ROUTE 3: LIVE WEB SEARCH (For real-time queries & squads)
    # ---------------------------------------------------------
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

    # ---------------------------------------------------------
    # ROUTE 4: STANDARD CHATGPT TEXT (With full memory!)
    # ---------------------------------------------------------
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