import os
import urllib.parse
import random
import re
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

class MessageItem(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[MessageItem]

def fetch_webpage_content(url: str, max_chars: int = 6000) -> str:
    """Downloads a webpage and extracts clean readable text."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            for element in soup(["script", "style", "nav", "footer", "header"]):
                element.decompose()
            text = soup.get_text(separator=' ')
            cleaned_text = ' '.join(text.split())
            return cleaned_text[:max_chars]
    except Exception:
        pass
    return ""

@app.get("/")
def home():
    return {"status": "Backend running with Roster Guardrails!"}

@app.post("/smart_chat")
def smart_chat(req: ChatRequest):
    if not req.messages:
        return {"response": "No message history provided."}

    history = [{"role": m.role, "content": m.content} for m in req.messages]
    latest_msg = history[-1]["content"].strip()
    latest_msg_lower = latest_msg.lower()
    
    current_date = datetime.datetime.now().strftime("%B %Y")
    api_key = os.environ.get("GROQ_API_KEY")
    client = Groq(api_key=api_key) if api_key else None

    seen_image_urls = set()
    for msg in history:
        if msg["role"] == "assistant":
            urls = re.findall(r'!\[IMAGE\]\((.*?)\)', msg["content"])
            for url in urls:
                seen_image_urls.add(url)

    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "Here is a real picture" in history[-2]["content"]

    image_keywords = ["image", "photo", "picture", "pic", "img", "generate", "draw", "create", "paint", "show me"]
    is_image_request = any(k in latest_msg_lower for k in image_keywords) or (
        prev_was_image and not any(k in latest_msg_lower for k in ["explain", "who is", "what is", "tell me", "why"])
    )

    # ROUTE 1: AI ART GENERATION
    if any(k in latest_msg_lower for k in ["generate", "draw", "create", "paint"]):
        prompt_encoded = urllib.parse.quote_plus(latest_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        def generate_art():
            yield f"Here is your generated AI image:\n\n{img_markdown}"
        return StreamingResponse(generate_art(), media_type="text/event-stream")

    # ROUTE 2: REAL WEB PHOTOS
    elif is_image_request:
        search_query = latest_msg
        num_images = 1
        if any(w in latest_msg_lower for w in ["two", "2"]): num_images = 2
        elif any(w in latest_msg_lower for w in ["three", "3"]): num_images = 3
        elif any(w in latest_msg_lower for w in ["four", "4"]): num_images = 4
        elif any(w in latest_msg_lower for w in ["five", "5", "some", "few", "more", "multiple", "another"]): num_images = 3
        
        remove_phrases = ["give me", "show me", "an image of", "the image of", "a picture of", "picture of", "image of", "photo of", "images of", "pictures of", "i want", "image", "photo", "picture", "images", "pics"]
        clean_search = search_query.lower()
        for phrase in remove_phrases:
            clean_search = clean_search.replace(phrase, "")
        clean_search = clean_search.strip() or search_query

        combined_images = ""
        try:
            results = DDGS().images(clean_search, max_results=50)
            if results:
                fresh_images = [res for res in results if res['image'] not in seen_image_urls]
                if len(fresh_images) >= num_images:
                    random.shuffle(fresh_images)
                    img_markdowns = [f"![IMAGE]({res['image']})" for res in fresh_images[:num_images]]
                    combined_images = "\n\n".join(img_markdowns)
        except Exception:
            pass
            
        if not combined_images:
            query_encoded = urllib.parse.quote_plus(clean_search)
            real_img_url = f"https://tse1.mm.bing.net/th?q={query_encoded}"
            combined_images = f"![IMAGE]({real_img_url})"

        def generate_images():
            yield f"Here are your pictures of {clean_search}:\n\n{combined_images}"
        return StreamingResponse(generate_images(), media_type="text/event-stream")

    # ROUTE 3: LIVE WEB SEARCH (With Strict Anti-Legend Guardrails)
    elif any(keyword in latest_msg_lower for keyword in [
        "search", "latest", "news", "real time", "current", "today", 
        "squad", "roster", "won", "score", "price of", "2024", "2025", "2026", "2027", "now", "players", "team", "list"
    ]):
        if not client:
            return StreamingResponse(iter(["⚠️ ERROR: GROQ_API_KEY missing."]), media_type="text/event-stream")
        
        def generate_live():
            try:
                opt_res = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[{"role": "user", "content": f"Create search keywords to find the official current team squad for: {latest_msg}"}],
                    temperature=0.1
                )
                search_term = opt_res.choices[0].message.content.replace('"', '').strip()
                
                results = DDGS().text(search_term, max_results=5)
                
                page_data = ""
                if results:
                    for item in results:
                        href = item.get("href", "")
                        if "realmadrid.com" in href or "wikipedia.org" in href or "espn" in href or "goal.com" in href:
                            page_data = fetch_webpage_content(href)
                            if page_data:
                                break
                    if not page_data and results:
                        page_data = fetch_webpage_content(results[0].get("href", ""))

                snippets_data = "\n".join([f"- {res['title']}: {res['body']}" for res in (results or [])])
                context_data = page_data if len(page_data) > 500 else snippets_data

                # 🚀 CRITICAL GUARDRAIL PROMPT BLOCKING RETIRED/TRANSFERRED PLAYERS
                system_prompt = (
                    f"Current Date: {current_date}.\n"
                    f"You are My AI Agent, a precision sports data assistant.\n"
                    f"Use the following web data to answer the user:\n\n{context_data}\n\n"
                    f"STRICT GUARDRAILS FOR SOCCER SQUADS:\n"
                    f"1. EXPLICITLY BANNED PLAYERS: You are strictly FORBIDDEN from listing Toni Kroos (retired), Luka Modrić (transferred to AC Milan), Karim Benzema (left club), Sergio Ramos, or Nacho Fernandez. Do NOT list them under any circumstances, even if they appear in your internal memory.\n"
                    f"2. Only list players currently active in the squad for the {current_date} timeframe (e.g., Thibaut Courtois, Kylian Mbappé, Jude Bellingham, Vinícius Júnior, Fede Valverde, Rodrygo, Antonio Rüdiger).\n"
                    f"3. Format your response cleanly using a Markdown Table (Columns: No., Player, Position) or professional bullet points.\n"
                    f"4. Be 100% accurate and professional."
                )
                
                stream = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[{"role": "system", "content": system_prompt}] + history,
                    temperature=0.1,
                    stream=True
                )
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"⚠️ Live Search Error: {str(e)}"
        
        return StreamingResponse(generate_live(), media_type="text/event-stream")

    # ROUTE 4: STANDARD CHAT
    else:
        if not client:
            return StreamingResponse(iter(["⚠️ ERROR: GROQ_API_KEY missing."]), media_type="text/event-stream")
        
        def generate_chat():
            try:
                system_instruction = [{"role": "system", "content": f"Current Date: {current_date}. You are a helpful AI assistant. Maintain context."}]
                stream = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=system_instruction + history,
                    temperature=0.7,
                    stream=True
                )
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"⚠️ API ERROR: {str(e)}"
        
        return StreamingResponse(generate_chat(), media_type="text/event-stream")