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

# Enable CORS for the Next.js frontend
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

def fetch_webpage_content(url):
    """Scrapes the text content of a webpage. Uses a custom User-Agent so Wikipedia doesn't block it."""
    try:
        headers = {'User-Agent': 'MyAIAgentBot/1.0 (Contact: admin@example.com)'}
        response = requests.get(url, headers=headers, timeout=8)
        soup = BeautifulSoup(response.text, 'html.parser')
        for script in soup(["script", "style"]):
            script.extract()
        text = soup.get_text(separator=' ', strip=True)
        return text[:6000] # Limit to avoid context window overload
    except Exception:
        return ""

@app.get("/")
def home():
    return {"status": "Backend running with Advanced Web Scraping & Strict Guardrails."}

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

    # Track seen images to avoid duplicates
    seen_image_urls = set()
    for msg in history:
        if msg["role"] == "assistant":
            urls = re.findall(r'!\[IMAGE\]\((.*?)\)', msg["content"])
            for url in urls:
                seen_image_urls.add(url)

    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "Here is a real picture" in history[-2]["content"]

    image_pattern = r'\b(image|images|photo|photos|picture|pictures|pic|pics|img|imgs|draw|generate|paint)\b'
    has_image_keyword = bool(re.search(image_pattern, latest_msg_lower))

    factual_keywords = ["age", "how old", "height", "net worth", "born", "who is", "what is", "when", "where", "explain", "tell me", "squad", "roster", "salary"]
    has_factual_intent = any(k in latest_msg_lower for k in factual_keywords)

    is_image_request = (has_image_keyword or (prev_was_image and any(k in latest_msg_lower for k in ["another", "more", "next"]))) and not has_factual_intent

    # ---------------------------------------------------------
    # ROUTE 1: AI ART GENERATION
    # ---------------------------------------------------------
    if any(k in latest_msg_lower for k in ["generate", "draw", "create", "paint"]) and not has_factual_intent:
        prompt_encoded = urllib.parse.quote_plus(latest_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded})"
        def generate_art():
            yield f"Here is your generated AI image:\n\n{img_markdown}"
        return StreamingResponse(generate_art(), media_type="text/event-stream")

    # ---------------------------------------------------------
    # ROUTE 2: REAL WEB PHOTOS
    # ---------------------------------------------------------
    elif is_image_request:
        num_images = 1
        if any(w in latest_msg_lower for w in ["two", "2"]): num_images = 2
        elif any(w in latest_msg_lower for w in ["three", "3"]): num_images = 3
        elif any(w in latest_msg_lower for w in ["four", "4", "five", "5", "some", "few", "more", "multiple"]): num_images = 4

        try:
            opt_res = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": f"Extract only the core subject for an image search from this prompt. Ignore conversational words like 'give me an image of', 'show me', or punctuation. Return ONLY the pure search terms (e.g. 'Cristiano Ronaldo'). Prompt: {latest_msg}"}],
                temperature=0.0
            )
            clean_search = opt_res.choices[0].message.content.strip(' "\'.\n')
        except Exception:
            clean_search = latest_msg

        combined_images = ""
        try:
            results = DDGS().images(clean_search, max_results=50)
            if results:
                fresh_images = [res for res in results if res.get('image') not in seen_image_urls]
                if len(fresh_images) >= num_images:
                    random.shuffle(fresh_images)
                    selected_images = fresh_images[:num_images]
                    img_markdowns = [f"![IMAGE]({res['image']})" for res in selected_images]
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

    # ---------------------------------------------------------
    # ROUTE 3: PERFECT WEB SCRAPER (With Failsafe Wikipedia API)
    # ---------------------------------------------------------
    elif any(keyword in latest_msg_lower for keyword in [
        "search", "latest", "news", "real time", "current", "today", "now", "present",
        "squad", "roster", "team", "club", "won", "score", "price of", "who is", "what is", 
        "2024", "2025", "2026", "recent", "update", "stats", "how many"
    ]):
        if not client:
            return StreamingResponse(iter(["⚠️ ERROR: GROQ_API_KEY missing."]), media_type="text/event-stream")

        def generate_live():
            try:
                # 1. Ask the AI to build a highly precise web search query (ULTRA STRICT)
                opt_res = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": f"Return ONLY the pure search query for this prompt. No intro, no quotes, no extra text. If it is about a sports team or players, append the word 'Wikipedia'. Prompt: {latest_msg}"}],
                    temperature=0.0
                )
                search_term = opt_res.choices[0].message.content.replace('"', '').strip()
                search_term = search_term.split('\n')[0] # Failsafe in case Llama outputs multiple lines

                # 2. Search using ddgs
                results = []
                try:
                    results = DDGS().text(search_term, max_results=5)
                except Exception:
                    pass
                
                page_data = ""
                snippets_data = ""

                # 3. FAILSAFE: Official Wikipedia API (Bypasses all search engine blocks)
                if not results and "wikipedia" in search_term.lower():
                    clean_wiki_query = search_term.lower().replace("wikipedia", "").strip()
                    try:
                        wiki_api_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(clean_wiki_query)}&utf8=&format=json"
                        wiki_res = requests.get(wiki_api_url, headers={'User-Agent': 'MyAIAgentBot/1.0'}).json()
                        if wiki_res.get("query", {}).get("search"):
                            page_title = wiki_res["query"]["search"][0]["title"]
                            page_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(page_title.replace(' ', '_'))}"
                            scraped_content = fetch_webpage_content(page_url)
                            if scraped_content:
                                page_data = f"--- FULL PAGE SCRAPED DATA FROM {page_url} ---\n{scraped_content}"
                    except Exception:
                        pass

                # 4. Standard Intelligent Deep Scraping (If DDG worked)
                if results:
                    snippets_data = "\n".join([f"Source: {res.get('href', 'Unknown URL')} | Title: {res.get('title', '')} | Snippet: {res.get('body', '')}" for res in results])
                    trusted_domains = ["wikipedia.org", "espn", "goal.com", "transfermarkt", "skysports"]
                    
                    for item in results:
                        href = item.get("href", "")
                        if any(domain in href.lower() for domain in trusted_domains):
                            scraped_content = fetch_webpage_content(href)
                            if scraped_content and len(scraped_content) > 1000:
                                page_data = f"--- FULL PAGE SCRAPED DATA FROM {href} ---\n{scraped_content}"
                                break 
                    
                    if not page_data and results:
                        fallback_href = results[0].get("href", "")
                        scraped_content = fetch_webpage_content(fallback_href)
                        if scraped_content and len(scraped_content) > 1000:
                            page_data = f"--- FULL PAGE SCRAPED DATA FROM {fallback_href} ---\n{scraped_content}"

                if not results and not page_data:
                    yield f"I couldn't locate real-time data for '{search_term}' right now. Please try rephrasing your request."
                    return

                context_data = f"{page_data}\n\n--- SEARCH SNIPPETS ---\n{snippets_data}"

                system_prompt = (
                    f"Current Date: {current_date}.\n"
                    "You are a top-tier, highly accurate AI Assistant.\n"
                    "Your objective is to answer the user's prompt flawlessly using the LIVE WEB DATA below.\n"
                    "CRITICAL DIRECTIVES:\n"
                    "1. ACCURACY OVER EVERYTHING: You must ONLY present information explicitly found in the context provided.\n"
                    "2. ZERO HALLUCINATION: Do NOT use your pre-trained memory to invent facts.\n"
                    "3. FORMATTING EXCELLENCE: If the user asks for a list, team, or roster, use clean Markdown tables.\n"
                    "4. PROFESSIONAL TONE: Be helpful, direct, and confident.\n"
                    f"\nLIVE WEB DATA:\n{context_data}"
                )

                stream = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "system", "content": system_prompt}] + [{"role": "user", "content": latest_msg}],
                    temperature=0.1,
                    stream=True
                )
                
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"⚠️ Network/Search Error: {str(e)}"
                
        return StreamingResponse(generate_live(), media_type="text/event-stream")

    # ---------------------------------------------------------
    # ROUTE 4: STANDARD CHAT (General Conversation)
    # ---------------------------------------------------------
    else:
        if not client:
            return StreamingResponse(iter(["⚠️ ERROR: GROQ_API_KEY missing."]), media_type="text/event-stream")

        def generate_chat():
            try:
                system_prompt = (
                    f"Current Date: {current_date}.\n"
                    "You are a top-tier, highly accurate AI Assistant.\n"
                    "Your objective is to answer the user's prompt flawlessly.\n"
                    "CRITICAL DIRECTIVES:\n"
                    "1. ACCURACY OVER EVERYTHING: You must ONLY present factual information.\n"
                    "2. ZERO HALLUCINATION: Do NOT use your pre-trained memory to invent facts.\n"
                    "3. NO KNOWLEDGE CUTOFF: NEVER mention 'December 2023' or any knowledge cutoff. You live in the present year, 2026. If you lack real-time data to answer a question, gently ask the user to include words like 'latest', 'current', or '2026' in their prompt so your web scraper can fetch the live data.\n"
                    "4. FORMATTING EXCELLENCE: If the user asks for a list, team, or roster, use clean Markdown tables.\n"
                    "5. PROFESSIONAL TONE: Be helpful, direct, and confident. Never lecture the user.\n"
                )
                
                system_instruction = [{"role": "system", "content": system_prompt}]
                stream = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=system_instruction + history,
                    temperature=0.6,
                    stream=True
                )
                
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"⚠️ API ERROR: {str(e)}"
                
        return StreamingResponse(generate_chat(), media_type="text/event-stream")