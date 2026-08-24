import time
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# UPGRADED: Now accepts a list of multiple images
class MessageItem(BaseModel):
    role: str
    content: str
    images: list[str] = [] 

class ChatRequest(BaseModel):
    messages: list[MessageItem]

def clean_scraped_text(text: str) -> str:
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def fetch_wikipedia_data(query: str) -> str:
    try:
        search_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&utf8=&format=json"
        search_data = requests.get(search_url, timeout=5).json()
        if search_data.get('query', {}).get('search'):
            title = search_data['query']['search'][0]['title']
            page_url = f"https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles={urllib.parse.quote(title)}&format=json"
            page_data = requests.get(page_url, timeout=5).json()
            pages = page_data.get('query', {}).get('pages', {})
            for page_id in pages:
                return pages[page_id].get('extract', '')[:4000]
    except Exception:
        pass
    return ""

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
        return ""

def extract_clean_subject(text: str) -> str:
    clean = re.sub(r'(?i)\b(give|show|send|get|fetch|me|please|can|you|the|an|a|some|more|another|pictures?|images?|photos?|pics?|imgs?|of|for|about)\b', '', text)
    return re.sub(r'[^\w\s]', '', clean).strip() or text.strip()

@app.get("/")
def home():
    return {"status": "Opus AI API Online - Multi-Vision Enabled."}

@app.post("/smart_chat")
def smart_chat(req: ChatRequest):
    if not req.messages:
        return {"response": "No message history provided."}

    latest_msg_obj = req.messages[-1]
    latest_msg = latest_msg_obj.content.strip()
    latest_msg_lower = latest_msg.lower()
    
    # Check if the user sent any images
    has_images = len(latest_msg_obj.images) > 0
    
    current_date = datetime.datetime.now().strftime("%B %d, %Y")
    
    api_key = os.environ.get("GROQ_API_KEY")
    client = Groq(api_key=api_key) if api_key else None
    
    if not client:
        return StreamingResponse(iter(["⚠️ Error: GROQ_API_KEY is missing from your server environment."]), media_type="text/event-stream")

    # --- ROUTE 0: VISION AI ---
    if has_images:
        def generate_vision_chat():
            try:
                # FIXED: Upgraded to Groq's active 90b Vision Model!
                VISION_MODEL = "qwen/qwen3.6-27b"
                
                vision_history = []
                for m in req.messages:
                    if getattr(m, 'images', None) and len(m.images) > 0:
                        content_array = [{"type": "text", "text": m.content}]
                        # Add every image the user attached
                        for img in m.images:
                            content_array.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}})
                        vision_history.append({"role": m.role, "content": content_array})
                    else:
                        vision_history.append({"role": m.role, "content": m.content})
                
                stream = client.chat.completions.create(
                    model=VISION_MODEL,
                    messages=[{"role": "system", "content": "You are Opus AI. Analyze the uploaded image(s) carefully and assist the user."}] + vision_history,
                    temperature=0.3,
                    stream=True
                )
                
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"I apologize, but I had trouble analyzing the images. (Error: {str(e)})"
                
        return StreamingResponse(
            generate_vision_chat(),
            media_type="text/event-stream",
            headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache", "Connection": "keep-alive"}
        )

    # --- ROUTE 1 & 2: TEXT & SEARCH AI ---
    GUARANTEED_MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant"]
    MODEL_NAME = "llama-3.3-70b-versatile" 
    try:
        active_models_data = client.models.list().data
        live_model_ids = [m.id for m in active_models_data]
        for g_model in GUARANTEED_MODELS:
            if g_model in live_model_ids:
                MODEL_NAME = g_model
                break
    except Exception:
        pass

    history = [{"role": m.role, "content": m.content} for m in req.messages]

    if bool(re.search(r'\b(image|images|photo|photos|picture|pictures|pic|pics)\b', latest_msg_lower)) and not bool(re.search(r'\b(age|squad|team|stats|who|what|where)\b', latest_msg_lower)):
        clean_search = extract_clean_subject(latest_msg)
        img_list = []
        try:
            results = DDGS().images(clean_search, max_results=3)
            for res in results:
                if res.get('image'): img_list.append(res['image'])
        except Exception:
            query_encoded = urllib.parse.quote_plus(clean_search)
            img_list = [f"https://tse1.mm.bing.net/th?q={query_encoded}&w=600&h=400&c=7&rs=1&p=0&dpr=1&pid=1.7&mkt=en-US&adlt=moderate&t={i}" for i in range(1, 4)]
            
        combined = "\n\n".join([f"![IMAGE]({url})" for url in img_list[:3]])
        def generate_images(): yield f"Here are pictures of {clean_search.title()}:\n\n{combined}"
        return StreamingResponse(generate_images(), media_type="text/event-stream")

    else:
        def generate_universal_chat():
            try:
                search_term = "NO_SEARCH"
                try:
                    opt_res = client.chat.completions.create(
                        model=MODEL_NAME,
                        messages=[{"role": "user", "content": f"Convert this message into a short Google search query. If casual, reply 'NO_SEARCH'. Message: {latest_msg}"}],
                        temperature=0.0
                    )
                    search_term = opt_res.choices[0].message.content.replace('"', '').strip().split('\n')[0]
                except Exception:
                    pass

                context_data = ""
                search_status_note = "No internet data available. Rely on internal knowledge."
                
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
                        pass 

                    wiki_data = fetch_wikipedia_data(search_term)
                    if wiki_data:
                        context_data += f"--- WIKIPEDIA BACKUP DATA ---\n{wiki_data}\n\n"
                    
                    if context_data.strip():
                        search_status_note = context_data
                    else:
                        search_status_note = "Live search is currently blocked. Provide the best possible answer."

                system_prompt = f"Current Date: {current_date}.\nYou are Opus AI.\n--- INTERNET DATA ---\n{search_status_note}"

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
                yield "I apologize, but I am experiencing a temporary network issue. Please try again."

        return StreamingResponse(generate_universal_chat(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache", "Connection": "keep-alive"})