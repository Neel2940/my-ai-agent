from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
from groq import Groq

# Initialize FastAPI
app = FastAPI()

# Enable CORS so your Vercel frontend can talk to Render
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq client
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Request structure
class ChatRequest(BaseModel):
    message: str

# ChatGPT System Prompt
SYSTEM_PROMPT = """You are a highly intelligent, helpful, and concise AI assistant. 
You behave exactly like ChatGPT. 
Always use Markdown to format your answers cleanly (use bolding, bullet points, and code blocks where appropriate). 
Provide direct, highly accurate answers without unnecessary fluff."""

@app.get("/")
def read_root():
    return {"status": "Backend is running and ready for chat!"}

@app.post("/smart_chat")
async def smart_chat(req: ChatRequest):
    def generate_typing_effect():
        stream = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": req.message}
            ],
            stream=True
        )
        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                yield chunk.choices[0].delta.content

    return StreamingResponse(generate_typing_effect(), media_type="text/plain")