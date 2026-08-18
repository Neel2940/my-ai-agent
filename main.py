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

def extract_clean_subject(text: str) -> str:
    """Removes conversational filler to isolate the core subject."""
    clean = re.sub(r'(?i)\b(give|show|send|get|fetch|me|please|can|you|the|an|a|some|more|another|pictures?|images?|photos?|pics?|imgs?|of|for|about|one|two|three|four|five|2|3|4|5)\b', '', text)
    clean = re.sub(r'[^\w\s]', '', clean).strip()
    return clean if clean else text.strip()

@app.get("/")
def home():
    return {"status": "Backend online with stable GPT-OSS 20B inference."}

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

    # Track seen images to avoid showing the same picture again
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
    factual_pattern = r'\b(age|how old|height|net worth|born|who is|what is|when|where|explain|squad|roster|team|club|score|players)\b'
    has_factual_intent = bool(re.search(factual_pattern, latest_msg_lower))

    is_image_request = (has_image_keyword or (prev_was_image and any(k in latest_msg_lower for k in ["another", "more", "next"]))) and not has_factual_intent

    # ROUTE 1: AI ART GENERATION
    if bool(re.search(r'\b(generate|draw|create image|paint)\b', latest_msg_lower)) and not has_factual_intent:
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
        elif any(w in latest_msg_lower for w in ["four", "4"]): num_images = 4
        elif any(w in latest_msg_lower for w in ["five", "5", "some", "few", "more", "multiple"]): num_images = 3

        clean_search = extract_clean_subject(latest_msg)
        if not clean_search and len(history) >= 2:
            clean_search = extract_clean_subject(history[-2]["content"])

        if client and len(clean_search.split()) > 4:
            try:
                opt_res = client.chat.completions.create(
                    model="openai/gpt-oss-20b",
                    messages=[{"role": "user", "content": f"Extract ONLY the core person or item name for an image search. Return 1-3 words only (e.g. 'Lamine Yamal'). Prompt: {latest_msg}"}],
                    temperature=0.0
                )
                extracted = opt_res.choices[0].message.content.strip(' "\'.\n')
                if extracted and len(extracted) < 30:
                    clean_search = extracted
            except Exception:
                pass

        img_list = []
        try:
            results = DDGS().images(clean_search, max_results=40)
            if results:
                for res in results:
                    img_url = res.get('image')
                    if img_url and img_url not in seen_image_urls and img_url not in img_list:
                        img_list.append(img_url)
                        if len(img_list) >= num_images:
                            break
        except Exception:
            pass

        if len(img_list) < num_images:
            query_encoded = urllib.parse.quote_plus(clean_search)
            for i in range(len(img_list), num_images):
                fallback_url = f"https://tse1.mm.bing.net/th?q={query_encoded}&w=600&h=400&c=7&rs=1&p=0&dpr=1&pid=1.7&mkt=en-US&adlt=moderate&t={i+1}"
                img_list.append(fallback_url)

        img_markdowns = [f"![IMAGE]({url})" for url in img_list]
        combined_images = "\n\n".join(img_markdowns)

        title_subject = clean_search.title() if clean_search else "your request"

        def generate_images():
            yield f"Here are {len(img_list)} pictures of {title_subject}:\n\n{combined_images}"
        return StreamingResponse(generate_images(), media_type="text/event-stream")

    # ROUTE 3: WEB SEARCH & LIVE KNOWLEDGE
    elif bool(re.search(r'\b(search|latest|news|current|today|now|present|squad|roster|team|club|won|score|price|who is|what is|age|born|2024|2025|2026|stats|players)\b', latest_msg_lower)):
        if not client:
            return StreamingResponse(iter(["⚠️ GROQ_API_KEY missing."]), media_type="text/event-stream")

        def generate_live():
            try:
                opt_res = client.chat.completions.create(
                    model="openai/gpt-oss-20b",
                    messages=[{"role": "user", "content": f"Convert this request into a concise Google/Wikipedia search query. Return ONLY the search terms: {latest_msg}"}],
                    temperature=0.0
                )
                search_term = opt_res.choices[0].message.content.replace('"', '').strip().split('\n')[0]

                context_data = ""
                if bool(re.search(r'\b(squad|roster|team|club|who is)\b', latest_msg_lower)):
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
                    "   - Group players by position using emoji headings (🥅 Goalkeepers, 🛡️ Defenders, ⚽ Midfielders, 🔥 Forwards).\n"
                    "   - Format: • Player Name — #JerseyNumber.\n"
                    "2. ACCURACY: Use provided data, never mention a knowledge cutoff.\n"
                    f"\nCONTEXT DATA:\n{context_data if context_data else 'Use your up-to-date knowledge base.'}"
                )

                stream = client.chat.completions.create(
                    model="openai/gpt-oss-20b",
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
                    "You are a highly capable AI Assistant. Answer clearly and factually without referencing knowledge cutoffs."
                )
                stream = client.chat.completions.create(
                    model="openai/gpt-oss-20b",
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