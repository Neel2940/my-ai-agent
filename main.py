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
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "Here is a real picture" in history[-2]["content"]

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
    # ROUTE 2: REAL WEB PHOTOS (Handles multi-turn image queries)
    # ---------------------------------------------------------
    elif is_image_request:
        search_query = latest_msg
        
        # If the user prompt is contextual, use Groq to resolve full search query
        if client and (len(latest_msg.split()) < 4 or "i want image" in latest_msg_lower or prev_was_image):
            try:
                refinement = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=history + [
                        {"role": "system", "content": "Extract ONLY a 2 to 5 word search term for Bing image search based on this conversation. Respond ONLY with the search term."}
                    ],
                    temperature=0.2
                )
                search_query = refinement.choices[0].message.content.strip()
            except Exception:
                pass

        # Clean common filler phrases
        remove_phrases = ["give me an", "give me a", "give me", "show me an", "show me a", "show me", "an image of", "the image of", "a picture of", "picture of", "image of", "photo of", "image in", "i want image", "image", "photo", "picture"]
        clean_search = search_query.lower()
        for phrase in remove_phrases:
            clean_search = clean_search.replace(phrase, "")
        clean_search = clean_search.strip() or search_query

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