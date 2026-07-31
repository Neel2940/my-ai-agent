import os
import urllib.parse
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq

app = FastAPI()

# Allow Vercel frontend to talk to Render
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

class ChatRequest(BaseModel):
    message: str

@app.get("/")
def home():
    return {"status": "Backend is running and ready for chat!"}

@app.post("/smart_chat")
async def smart_chat(req: ChatRequest):
    user_msg = req.message.strip()
    user_msg_lower = user_msg.lower()

    # 1. Image Generation Request
    if any(keyword in user_msg_lower for keyword in ["image", "draw", "picture", "photo", "generate"]):
        prompt_encoded = urllib.parse.quote_plus(user_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        
        async def image_stream():
            yield f"Here is your generated image:\n\n{img_markdown}"
            
        return StreamingResponse(image_stream(), media_type="text/plain")

    # 2. General AI Chat Request (Streaming)
    try:
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant like ChatGPT. Answer questions thoroughly and clearly."},
                {"role": "user", "content": user_msg}
            ],
            temperature=0.7,
            stream=True
        )

        def generate_chunks():
            for chunk in completion:
                content = chunk.choices[0].delta.content
                if content:
                    yield content

        return StreamingResponse(generate_chunks(), media_type="text/plain")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))