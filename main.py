import os
import urllib.parse
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq

app = FastAPI()

# Allow Vercel to communicate securely
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
async def smart_chat(req: ChatRequest):
    user_msg = req.message.strip()
    user_msg_lower = user_msg.lower()

    # 1. Image Generation (Crash-Proof)
    if any(keyword in user_msg_lower for keyword in ["image", "draw", "picture", "photo", "generate"]):
        prompt_encoded = urllib.parse.quote_plus(user_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        
        async def image_stream():
            yield f"Here is your generated image:\n\n{img_markdown}".encode("utf-8")
            
        return StreamingResponse(image_stream(), media_type="text/plain")

    # 2. Check for Missing API Key
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        async def key_error_stream():
            yield "⚠️ ERROR: Your GROQ_API_KEY is missing on Render. Please check your Environment Variables.".encode("utf-8")
        return StreamingResponse(key_error_stream(), media_type="text/plain")

    # 3. AI Text Chat (Crash-Proof Streaming)
    try:
        client = Groq(api_key=api_key)
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
            try:
                for chunk in completion:
                    # Safely extract text chunks
                    if chunk.choices and len(chunk.choices) > 0:
                        content = chunk.choices[0].delta.content
                        if content:
                            # Encode as bytes to prevent frontend freezing
                            yield content.encode("utf-8")
            except Exception as stream_err:
                yield f"\n\n[Stream Error: {str(stream_err)}]".encode("utf-8")

        return StreamingResponse(generate_chunks(), media_type="text/plain")

    except Exception as e:
        # If Groq crashes, send the exact error text to the chat window
        async def crash_stream():
            yield f"⚠️ API ERROR: {str(e)}".encode("utf-8")
        return StreamingResponse(crash_stream(), media_type="text/plain")