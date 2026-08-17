import os
import re
import urllib.parse
import datetime
import random
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

def clean_scraped_text(text: str) -> str:
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def fetch_webpage_content(url: str) -> str:
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=7)
        if response.status_code != 200:
            return ""
        soup = BeautifulSoup(response.text, 'html.parser')
        
        roster_data = ""
        for table in soup.find_all('table'):
            table_text = table.get_text(separator=' ', strip=True).lower()
            if 'player' in table_text and ('pos' in table_text or 'nat' in table_text or 'no.' in table_text or 'app' in table_text):
                for row in table.find_all('tr'):
                    roster_data += row.get_text(separator=' | ', strip=True) + "\n"
                roster_data += "\n"

        for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            element.decompose()
            
        main_text = soup.get_text(separator=' ')
        clean_main = clean_scraped_text(main_text)
        
        final_text = f"--- CRITICAL SQUAD/ROSTER DATA ---\n{roster_data}\n--- PAGE TEXT ---\n{clean_main}"
        return final_text[:10000]
    except Exception:
        return ""

def search_wikipedia_direct(entity: str) -> str:
    try:
        search_term = entity.strip()
        if not any(w in search_term.lower() for w in ["fc", "f.c.", "club"]):
            search_term += " F.C."
        
        api_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(search_term)}&utf8=&format=json"
        res = requests.get(api_url, headers={'User-Agent': 'MyAIAgent/2.0'}, timeout=5).json()
        
        results = res.get("query", {}).get("search", [])
        if not results:
            return ""

        selected_title = results[0]["title"]
        for r in results:
            t = r["title"].lower()
            if "esports" not in t and "academy" not in t and "season" not in t:
                selected_title = r["title"]
                break

        page_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(selected_title.replace(' ', '_'))}"
        return fetch_webpage_content(page_url)
    except Exception:
        return ""

@app.get("/")
def home():
    return {"status": "Backend online with Llama 3.1 inference."}

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
            for url in re.findall(r'!\[IMAGE\]\((.*?)\)', msg["content"]):
                seen_image_urls.add(url)

    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "pictures of" in history[-2]["content"]

    image_pattern = r'\b(image|images|photo|photos|picture|pictures|pic|pics|img|imgs|draw|paint)\b'
    has_image_keyword = bool(re.search(image_pattern, latest_msg_lower))
    factual_keywords = ["age", "how old", "height", "net worth", "born", "who is", "what is", "when", "where", "explain", "squad", "roster", "team", "club", "score", "players"]
    has_factual_intent = any(k in latest_msg_lower for k in factual_keywords)

    is_image_request = (has_image_keyword or (prev_was_image and any(k in latest_msg_lower for k in ["another", "more", "next"]))) and not has_factual_intent

    # ROUTE 1: AI ART GENERATION
    if any(k in latest_msg_lower for k in ["generate", "draw", "create image", "paint"]) and not has_factual_intent:
        prompt_encoded = urllib.parse.quote_plus(latest_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded})"
        def generate_art():
            yield f"Here is your generated AI image:\n\n{img_markdown}"
        return StreamingResponse(generate_art(), media_type="text/event-stream")

    # ROUTE 2: REAL WEB PHOTOS
    elif is_image_request:
        num_images = 1
        if any(w in latest_msg_lower for w in ["two", "2"]): num_images = 2
        elif any(w in latest_msg_lower for w in ["three", "3"]): num_images = 3
        elif any(w in latest_msg_lower for w in ["four", "4", "five", "5", "more", "multiple"]): num_images = 4

        clean_search = latest_msg
        if client:
            try:
                opt_res = client.chat.completions.create(
                    model="llama-3.1-70b-versatile",
                    messages=[{"role": "user", "content": f"Extract ONLY the main subject for image search from this text (e.g. 'Cristiano Ronaldo'): {latest_msg}"}],
                    temperature=0.0
                )
                clean_search = opt_res.choices[0].message.content.strip(' "\'.\n')
            except Exception:
                pass

        combined_images = ""
        try:
            results = DDGS().images(clean_search, max_results=30)
            if results:
                fresh_images = [res for res in results if res.get('image') not in seen_image_urls]
                if fresh_images:
                    random.shuffle(fresh_images)
                    selected_images = fresh_images[:num_images]
                    combined_images = "\n\n".join([f"![IMAGE]({res['image']})" for res in selected_images])
        except Exception:
            pass

        if not combined_images:
            query_encoded = urllib.parse.quote_plus(clean_search)
            combined_images = f"![IMAGE](https://tse1.mm.bing.net/th?q={query_encoded})"

        def generate_images():
            yield f"Here are your pictures of {clean_search}:\n\n{combined_images}"
        return StreamingResponse(generate_images(), media_type="text/event-stream")

    # ROUTE 3: WEB SEARCH & LIVE KNOWLEDGE
    elif any(k in latest_msg_lower for k in [
        "search", "latest", "news", "current", "today", "now", "present",
        "squad", "roster", "team", "club", "won", "score", "price", "who is", "what is",
        "age", "born", "2024", "2025", "2026", "stats", "players"
    ]):
        if not client:
            return StreamingResponse(iter(["⚠️ GROQ_API_KEY missing."]), media_type="text/event-stream")

        def generate_live():
            try:
                opt_res = client.chat.completions.create(
                    model="llama-3.1-70b-versatile",
                    messages=[{"role": "user", "content": f"Convert this request into a concise Google/Wikipedia search query. If it is a football/sports squad request, format as '[Club Name] current first team squad'. Return ONLY the search terms: {latest_msg}"}],
                    temperature=0.0
                )
                search_term = opt_res.choices[0].message.content.replace('"', '').strip().split('\n')[0]

                context_data = ""
                
                if any(w in latest_msg_lower for w in ["squad", "roster", "team", "club", "who is"]):
                    wiki_data = search_wikipedia_direct(search_term)
                    if wiki_data:
                        context_data += f"--- WIKIPEDIA SQUAD & PROFILE DATA ---\n{wiki_data}\n\n"

                try:
                    ddg_results = DDGS().text(search_term, max_results=5)
                    if ddg_results:
                        snippets = "\n".join([f"Source: {r.get('title')} ({r.get('href')}): {r.get('body')}" for r in ddg_results])
                        context_data += f"--- WEB SEARCH SNIPPETS ---\n{snippets}\n\n"
                except Exception:
                    pass

                system_prompt = (
                    f"Current Date: {current_date}.\n"
                    "You are a top-tier, world-class AI Assistant designed to deliver comprehensive, accurate responses.\n\n"
                    "STYLE & FORMATTING DIRECTIVES:\n"
                    "1. FOR SQUADS & ROSTERS:\n"
                    "   - State the official club name and season clearly.\n"
                    "   - Group players neatly by position using emoji headings:\n"
                    "     🥅 Goalkeepers\n"
                    "     🛡️ Defenders\n"
                    "     ⚽ Midfielders\n"
                    "     🔥 Forwards\n"
                    "   - Format each player as: • Player Name — #JerseyNumber (or position if number unavailable).\n"
                    "   - Add the Manager name and any recent major titles/achievements at the bottom.\n"
                    "2. ABSOLUTE ACCURACY: Use the provided context data to populate the exact current players. Never mention 'knowledge cutoff' or 'December 2023'.\n"
                    "3. TONE: Confident, polished, and structured, matching ChatGPT's response quality.\n\n"
                    f"CONTEXT DATA:\n{context_data if context_data else 'Use your up-to-date knowledge base.'}"
                )

                stream = client.chat.completions.create(
                    model="llama-3.1-70b-versatile",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": latest_msg}
                    ],
                    temperature=0.2,
                    stream=True
                )

                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content

            except Exception as e:
                yield f"⚠️ Error fetching live data: {str(e)}"

        return StreamingResponse(generate_live(), media_type="text/event-stream")

    # ROUTE 4: STANDARD GENERAL CHAT
    else:
        if not client:
            return StreamingResponse(iter(["⚠️ GROQ_API_KEY missing."]), media_type="text/event-stream")

        def generate_chat():
            try:
                system_prompt = (
                    f"Current Date: {current_date}.\n"
                    "You are a highly capable and intelligent AI Assistant.\n"
                    "Answer clearly, thoroughly, and factually. Never mention a 2023 knowledge cutoff."
                )
                stream = client.chat.completions.create(
                    model="llama-3.1-70b-versatile",
                    messages=[{"role": "system", "content": system_prompt}] + history,
                    temperature=0.6,
                    stream=True
                )
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"⚠️ API ERROR: {str(e)}"

        return StreamingResponse(generate_chat(), media_type="text/event-stream")