import os
import urllib.parse
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from duckduckgo_search import DDGS # New live search tool!

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

@app.get("/")
def home():
    return {"status": "Backend is running and ready for chat!"}

@app.post("/smart_chat")
def smart_chat(req: ChatRequest):
    user_msg = req.message.strip()
    user_msg_lower = user_msg.lower()
    
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return {"response": "⚠️ ERROR: Your GROQ_API_KEY is missing on Render."}

    # ---------------------------------------------------------
    # BRAIN 1: AI IMAGE GENERATOR
    # ---------------------------------------------------------
    if any(keyword in user_msg_lower for keyword in ["generate", "draw", "create", "paint"]):
        prompt_encoded = urllib.parse.quote_plus(user_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        return {"response": f"Here is your generated AI image:\n\n{img_markdown}"}

    # ---------------------------------------------------------
    # BRAIN 2: REAL WEB PHOTOS
    # ---------------------------------------------------------
    elif any(keyword in user_msg_lower for keyword in ["image of", "picture of", "photo of", "show me"]):
        clean_search = user_msg_lower
        remove_phrases = ["give me", "show me", "an image of", "the image of", "a picture of", "picture of", "image of", "photo of", "a photo of"]
        for phrase in remove_phrases:
            clean_search = clean_search.replace(phrase, "")
        
        clean_search = clean_search.strip()
        query_encoded = urllib.parse.quote_plus(clean_search)
        real_img_url = f"https://tse1.mm.bing.net/th?q={query_encoded}"
        return {"response": f"Here is a real picture of {clean_search}:\n\n![IMAGE]({real_img_url})"}

    # ---------------------------------------------------------
    # BRAIN 3: LIVE WEB SEARCH (For real-time data)
    # ---------------------------------------------------------
    elif any(keyword in user_msg_lower for keyword in ["search the web", "latest news", "real time", "current roster"]):
        try:
            # 1. Ask DuckDuckGo for the top 3 live internet results
            results = DDGS().text(user_msg, max_results=3)
            live_info = "\n".join([f"- {res['title']}: {res['body']}" for res in results])
            
            # 2. Feed that live info into the AI so it can read it
            client = Groq(api_key=api_key)
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": f"You are a helpful AI. Answer the user's question using ONLY this live internet data:\n\n{live_info}"},
                    {"role": "user", "content": user_msg}
                ],
                temperature=0.5
            )
            return {"response": completion.choices[0].message.content}
        except Exception as e:
            return {"response": f"⚠️ Live Search Error: {str(e)}"}

    # ---------------------------------------------------------
    # BRAIN 4: NORMAL CHATGPT TEXT (For standard questions)
    # ---------------------------------------------------------
    else:
        try:
            client = Groq(api_key=api_key)
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": "You are a highly intelligent AI assistant."},
                    {"role": "user", "content": user_msg}
                ],
                temperature=0.7
            )
            return {"response": completion.choices[0].message.content}
        except Exception as e:
            return {"response": f"⚠️ API ERROR: {str(e)}"}