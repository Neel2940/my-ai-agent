import time
import os
import re
import urllib.parse
import datetime
import requests
import base64
from bs4 import BeautifulSoup
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from google import genai
from google.genai import types
from duckduckgo_search import DDGS

# Rate Limiter setup
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# 1. Initialize Rate Limiter (tracks by user IP)
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Opus AI Backend")
app.state.limiter = limiter

# Custom response when a user exceeds their daily or minute limit
@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "error": "You have reached your free daily message limit. Please try again later tomorrow!"
        }
    )

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
    images: list[str] = []

class ChatRequest(BaseModel):
    messages: list[MessageItem]

def extract_clean_subject(text: str) -> str:
    clean = re.sub(
        r'(?i)\b(give|show|send|get|fetch|me|please|can|you|the|an|a|some|more|another|pictures?|images?|photos?|pics?|imgs?|of|for|about)\b',
        '',
        text
    )
    return re.sub(r'[^\w\s]', '', clean).strip() or text.strip()

@app.get("/")
def home():
    return {"status": "Opus AI API Online - Gemini Flash Engine Active."}

# 2. Main Chat Route with Rate Limiting (50/day and 10/minute per IP)
@app.post("/smart_chat")
@limiter.limit("50/day")
@limiter.limit("10/minute")
def smart_chat(request: Request, req: ChatRequest):
    if not req.messages:
        return {"response": "No message history provided."}

    latest_msg_obj = req.messages[-1]
    latest_msg = latest_msg_obj.content.strip()
    latest_msg_lower = latest_msg.lower()
    has_images = len(latest_msg_obj.images) > 0
    current_date = datetime.datetime.now().strftime("%B %d, %Y")
    
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key) if api_key else None
    
    if not client:
        return StreamingResponse(
            iter(["⚠️ Error: GEMINI_API_KEY is missing from your server environment."]),
            media_type="text/event-stream"
        )

    # Use the stable production Flash model
    ACTIVE_MODEL = "gemini-2.0-flash"

    # --- ROUTE 0: VISION AI ---
    if has_images:
        def generate_vision_chat():
            retries = 2
            for attempt in range(retries + 1):
                try:
                    gemini_contents = [latest_msg]
                    for img_b64 in latest_msg_obj.images:
                        img_bytes = base64.b64decode(img_b64)
                        gemini_contents.append(
                            types.Part.from_bytes(data=img_bytes, mime_type='image/jpeg')
                        )
                    
                    stream = client.models.generate_content_stream(
                        model=ACTIVE_MODEL,
                        contents=gemini_contents,
                    )
                    
                    for chunk in stream:
                        if chunk.text:
                            yield chunk.text
                    return
                except Exception as e:
                    if "503" in str(e) and attempt < retries:
                        time.sleep(2)
                        continue
                    yield f"I apologize, but I had trouble analyzing the images. (Error: {str(e)})"
                    return
                
        return StreamingResponse(
            generate_vision_chat(),
            media_type="text/event-stream",
            headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache", "Connection": "keep-alive"}
        )

    # --- ROUTE 1: IMAGE SEARCH ---
    if bool(re.search(r'\b(image|images|photo|photos|picture|pictures|pic|pics)\b', latest_msg_lower)) and not bool(re.search(r'\b(age|squad|team|stats|who|what|where)\b', latest_msg_lower)):
        clean_search = extract_clean_subject(latest_msg)
        img_list = []
        try:
            results = DDGS().images(clean_search, max_results=3)
            for res in results:
                if res.get('image'):
                    img_list.append(res['image'])
        except Exception:
            query_encoded = urllib.parse.quote_plus(clean_search)
            img_list = [
                f"https://tse1.mm.bing.net/th?q={query_encoded}&w=600&h=400&c=7&rs=1&p=0&dpr=1&pid=1.7&mkt=en-US&adlt=moderate&t={i}"
                for i in range(1, 4)
            ]
            
        combined = "\n\n".join([f"![IMAGE]({url})" for url in img_list[:3]])
        def generate_images():
            yield f"Here are pictures of {clean_search.title()}:\n\n{combined}"
        return StreamingResponse(generate_images(), media_type="text/event-stream")

    # --- ROUTE 2: TEXT AI ---
    else:
        def generate_universal_chat():
            retries = 2
            for attempt in range(retries + 1):
                try:
                    gemini_history = []
                    for m in req.messages[:-1]:
                        gemini_history.append(
                            types.Content(
                                role="user" if m.role == "user" else "model",
                                parts=[types.Part.from_text(text=m.content)]
                            )
                        )
                    
                    system_prompt = (
                        f"Current Date: {current_date}.\n"
                        f"You are Opus AI, an intelligent, helpful, and friendly AI assistant. "
                        f"Answer the user's questions clearly, accurately, and thoroughly."
                    )
                    gemini_history.insert(0, types.Content(role="user", parts=[types.Part.from_text(text=system_prompt)]))
                    gemini_history.insert(1, types.Content(role="model", parts=[types.Part.from_text(text="Understood.")]))
                    gemini_history.append(types.Content(role="user", parts=[types.Part.from_text(text=latest_msg)]))
                    
                    stream = client.models.generate_content_stream(
                        model=ACTIVE_MODEL,
                        contents=gemini_history,
                    )
                    
                    for chunk in stream:
                        if chunk.text:
                            yield chunk.text
                    return
                except Exception as e:
                    if "503" in str(e) and attempt < retries:
                        time.sleep(2)
                        continue
                    yield f"I apologize, but I am experiencing a temporary network issue. (Error: {str(e)})"
                    return

        return StreamingResponse(
            generate_universal_chat(),
            media_type="text/event-stream",
            headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache", "Connection": "keep-alive"}
        )