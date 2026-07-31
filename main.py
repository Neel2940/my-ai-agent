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

    # ---------------------------------------------------------
    # BRAIN 1: AI IMAGE GENERATOR (Only for "Generate" or "Draw")
    # ---------------------------------------------------------
    if any(keyword in user_msg_lower for keyword in ["generate", "draw", "create", "paint"]):
        prompt_encoded = urllib.parse.quote_plus(user_msg)
        img_markdown = f"![AI Image](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        return {"response": f"Here is your generated AI image:\n\n{img_markdown}"}

    # ---------------------------------------------------------
    # BRAIN 2: REAL WEB SEARCH (For "Image of" or "Picture of")
    # ---------------------------------------------------------
    elif any(keyword in user_msg_lower for keyword in ["image of", "picture of", "photo of", "show me"]):
        # Clean up the prompt to find exactly who the user is asking for
        clean_search = user_msg_lower.replace("give me", "").replace("the image of", "").replace("a picture of", "").strip()
        query_encoded = urllib.parse.quote_plus(clean_search)
        
        # This uses a free Bing Web Image trick to pull real photos instantly!
        real_img_url = f"https://tse1.mm.bing.net/th?q={query_encoded}"
        return {"response": f"Here is a real picture of {clean_search}:\n\n![Real Image]({real_img_url})"}

    # ---------------------------------------------------------
    # BRAIN 3: NORMAL CHATGPT TEXT (For everything else)
    # ---------------------------------------------------------
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return {"response": "⚠️ ERROR: Your GROQ_API_KEY is missing on Render."}

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
        
        ai_text = completion.choices[0].message.content
        return {"response": ai_text}

    except Exception as e:
        return {"response": f"⚠️ API ERROR: {str(e)}"}