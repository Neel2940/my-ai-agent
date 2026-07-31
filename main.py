import os
import urllib.parse
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

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

    # 1. Image Generation
    if any(keyword in user_msg_lower for keyword in ["image", "draw", "picture", "photo", "generate"]):
        prompt_encoded = urllib.parse.quote_plus(user_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        return {"response": f"Here is your generated image:\n\n{img_markdown}"}

    # 2. API Key Check
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return {"response": "⚠️ ERROR: Your GROQ_API_KEY is missing on Render."}

    # 3. AI Text Chat
    try:
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant like ChatGPT."},
                {"role": "user", "content": user_msg}
            ],
            temperature=0.7
        )
        
        # Return the full answer instantly
        ai_text = completion.choices[0].message.content
        return {"response": ai_text}

    except Exception as e:
        return {"response": f"⚠️ API ERROR: {str(e)}"}