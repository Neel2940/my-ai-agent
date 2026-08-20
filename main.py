import os
import re
import urllib.parse
import datetime
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from duckduckgo_search import DDGS

app = FastAPI()

# --- 1. SERVER CONFIGURATION ---
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

# --- 2. CRASH-PROOF WEB SCRAPING ENGINE ---
def clean_scraped_text(text: str) -> str:
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def fetch_webpage_content(url: str) -> str:
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code != 200:
            return ""
        soup = BeautifulSoup(response.text, 'html.parser')
        
        roster_data = ""
        for table in soup.find_all('table'):
            table_text = table.get_text(separator=' ', strip=True).lower()
            if any(w in table_text for w in ['player', 'name']) and any(w in table_text for w in ['pos', 'number', 'squad']):
                for row in table.find_all('tr'):
                    roster_data += row.get_text(separator=' | ', strip=True) + "\n"
        
        for element in soup(["script", "style", "nav", "footer", "header", "noscript", "aside"]):
            element.decompose()
            
        main_text = clean_scraped_text(soup.get_text(separator=' '))
        return f"{roster_data}\n\n{main_text}"[:8000]
    except Exception:
        # If the website blocks us, fail silently so the app doesn't crash
        return ""

def extract_clean_subject(text: str) -> str:
    clean = re.sub(r'(?i)\b(give|show|send|get|fetch|me|please|can|you|the|an|a|some|more|another|pictures?|images?|photos?|pics?|imgs?|of|for|about)\b', '', text)
    return re.sub(r'[^\w\s]', '', clean).strip() or text.strip()

# --- 3. CORE CHAT ROUTE ---
@app.get("/")
def home():
    return {"status": "Opus AI API Online."}

@app.post("/smart_chat")
def smart_chat(req: ChatRequest):
    if not req.messages:
        return {"response": "No message history provided."}

    history = [{"role": m.role, "content": m.content} for m in req.messages]
    latest_msg = history[-1]["content"].strip()
    latest_msg_lower = latest_msg.lower()
    
    current_date = datetime.datetime.now().strftime("%B %d, %Y")
    
    api_key = os.environ.get("GROQ_API_KEY")
    client = Groq(api_key=api_key) if api_key else None
    
    if not client:
        return StreamingResponse(iter(["⚠️ Error: GROQ_API_KEY is missing from your server environment."]), media_type="text/event-stream")

    # --- THE BULLETPROOF MODEL SELECTOR ---
    MODEL_NAME = "llama-3.3-70b-versatile" # Default rock-solid model
    try:
        active_models_data = client.models.list().data
        live_model_ids = [m.id for m in active_models_data]
        
        # Strip out non-conversational models to prevent crashes
        valid_chat_models = [
            m for m in live_model_ids 
            if "whisper" not in m.lower() and "guard" not in m.lower() and "vision" not in m.lower() and "tts" not in m.lower()
        ]
        
        if valid_chat_models:
            # Target the absolute best production models available on Groq
            if "llama-3.3-70b-versatile" in valid_chat_models:
                MODEL_NAME = "llama-3.3-70b-versatile"
            elif "openai/gpt-oss-20b" in valid_chat_models:
                MODEL_NAME = "openai/gpt-oss-20b"
            elif "llama-3.1-8b-instant" in valid_chat_models:
                MODEL_NAME = "llama-3.1-8b-instant"
            else:
                llamas = [m for m in valid_chat_models if "llama" in m.lower()]
                MODEL_NAME = llamas[0] if llamas else valid_chat_models[0]
    except Exception:
        pass

    # --- ROUTING LOGIC ---
    
    # 1. IMAGE REQUEST
    if bool(re.search(r'\b(image|images|photo|photos|picture|pictures|pic|pics)\b', latest_msg_lower)) and not bool(re.search(r'\b(age|squad|team|stats|who|what|where)\b', latest_msg_lower)):
        clean_search = extract_clean_subject(latest_msg)
        img_list = []
        try:
            results = DDGS().images(clean_search, max_results=3)
            for res in results:
                if res.get('image'): img_list.append(res['image'])
        except Exception:
            # Backup image generator if DuckDuckGo fails
            query_encoded = urllib.parse.quote_plus(clean_search)
            img_list = [f"https://tse1.mm.bing.net/th?q={query_encoded}&w=600&h=400&c=7&rs=1&p=0&dpr=1&pid=1.7&mkt=en-US&adlt=moderate&t={i}" for i in range(1, 4)]
            
        combined = "\n\n".join([f"![IMAGE]({url})" for url in img_list[:3]])
        def generate_images(): yield f"Here are pictures of {clean_search.title()}:\n\n{combined}"
        return StreamingResponse(generate_images(), media_type="text/event-stream")

    # 2. UNIVERSAL CHAT & REAL-TIME SEARCH
    else:
        def generate_universal_chat():
            try:
                # Ask the AI what to search
                search_term = "NO_SEARCH"
                try:
                    opt_res = client.chat.completions.create(
                        model=MODEL_NAME,
                        messages=[{"role": "user", "content": f"Convert this message into a short Google search query to find any real-world facts, dates, statistics, or current events. If it is just a casual greeting (like 'hi'), reply exactly with 'NO_SEARCH'. Message: {latest_msg}"}],
                        temperature=0.0
                    )
                    search_term = opt_res.choices[0].message.content.replace('"', '').strip().split('\n')[0]
                except Exception:
                    pass

                context_data = ""
                
                # Safely Search the Web
                if search_term and search_term != "NO_SEARCH" and "NO_SEARCH" not in search_term:
                    try:
                        ddg_results = DDGS().text(search_term, max_results=4)
                        if ddg_results:
                            for r in ddg_results:
                                href = r.get('href', '')
                                if any(domain in href.lower() for domain in ['goal.com', 'espn', 'wikipedia', 'bbc']):
                                    page_text = fetch_webpage_content(href)
                                    if len(page_text) > 300:
                                        context_data += f"--- SCRAPED FROM {href} ---\n{page_text}\n\n"
                                        break
                            
                            snippets = "\n".join([f"Source: {r.get('title')}: {r.get('body')}" for r in ddg_results])
                            context_data += f"--- SEARCH SNIPPETS ---\n{snippets}\n\n"
                    except Exception:
                        pass # Ignore search errors so the AI can still reply

                # Stream the Final Answer
                system_prompt = (
                    f"Current Date: {current_date}.\n"
                    "You are Opus AI, a brilliant, highly reliable, and intelligent AI assistant.\n"
                    "If internet data is provided below, use it to accurately answer the user's question. Format your answers clearly.\n"
                    f"\n--- INTERNET DATA ---\n{context_data if context_data else 'No internet data available. Rely on internal knowledge.'}"
                )

                stream = client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=[{"role": "system", "content": system_prompt}] + history,
                    temperature=0.4,
                    stream=True
                )

                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content

            except Exception as e:
                # Clean error message instead of crashing
                yield "I apologize, but I am experiencing a temporary network issue. Please try your request again in a moment."

        return StreamingResponse(generate_universal_chat(), media_type="text/event-stream")