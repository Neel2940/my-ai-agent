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
    """Scrapes the text content of a webpage to bypass DDGS snippet limits."""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(response.text, 'html.parser')
        # Remove scripts and styles for clean text extraction
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

    # Format history for Groq
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

    # Contextual check if the previous message triggered an image
    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "Here is a real picture" in history[-2]["content"]

    # --- UPGRADED ACCURATE INTENT DETECTION ---
    # 1. Use regex for exact word boundaries so 'pic' or 'img' doesn't mismatch inside other words
    image_pattern = r'\b(image|images|photo|photos|picture|pictures|pic|pics|img|imgs|draw|generate|paint)\b'
    has_image_keyword = bool(re.search(image_pattern, latest_msg_lower))

    # 2. Check for clear factual/question words
    factual_keywords = ["age", "how old", "height", "net worth", "born", "who is", "what is", "when", "where", "explain", "tell me", "squad", "roster", "salary"]
    has_factual_intent = any(k in latest_msg_lower for k in factual_keywords)

    # 3. Determine if this is TRULY an image request (Never trigger an image if they ask a factual question)
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
    # ROUTE 2: REAL WEB PHOTOS (Upgraded with AI Entity Extraction)
    # ---------------------------------------------------------
    elif is_image_request:
        num_images = 1
        if any(w in latest_msg_lower for w in ["two", "2"]): num_images = 2
        elif any(w in latest_msg_lower for w in ["three", "3"]): num_images = 3
        elif any(w in latest_msg_lower for w in ["four", "4"]): num_images = 4
        elif any(w in latest_msg_lower for w in ["five", "5", "some", "few", "more", "multiple"]): num_images = 4

        # Ask the AI to extract a flawless, clean search string
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
            # Using updated ddgs library format
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
    # ROUTE 3: PERFECT WEB SCRAPER (For accurate lists & real-time info)
    # ---------------------------------------------------------
    elif any(keyword in latest_msg_lower for keyword in [
        "search", "latest", "news", "real time", "current", "today", 
        "squad", "roster", "won", "score", "price of", "2024", "2025", "2026"
    ]):
        if not client:
            return StreamingResponse(iter(["⚠️ ERROR: GROQ_API_KEY missing."]), media_type="text/event-stream")

        def generate_live():
            try:
                # 1. Ask the AI to build a highly precise web search query
                opt_res = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": f"Extract the core subject for a web search. Ignore conversational filler. If the user asks for a sports team squad, roster, or list of players, YOU MUST append the word 'Wikipedia' to the end of your search string to bypass anti-bot blockers (e.g., 'Paris Saint-Germain 2026-27 squad Wikipedia'). Query: {latest_msg}"}],
                    temperature=0.0
                )
                search_term = opt_res.choices[0].message.content.replace('"', '').strip()

                # 2. Search using ddgs
                results = DDGS().text(search_term, max_results=5)
                
                # 3. Intelligent Deep Scraping
                page_data = ""
                snippets_data = ""

                if results:
                    snippets_data = "\n".join([f"Source: {res.get('href', 'Unknown URL')} | Title: {res.get('title', '')} | Snippet: {res.get('body', '')}" for res in results])
                    
                    # Look for authoritative sources to deep-scrape
                    trusted_domains = ["wikipedia.org", "espn", "goal.com", "transfermarkt", "skysports"]
                    
                    for item in results:
                        href = item.get("href", "")
                        if any(domain in href.lower() for domain in trusted_domains):
                            scraped_content = fetch_webpage_content(href)
                            if scraped_content and len(scraped_content) > 1000:
                                page_data = f"--- FULL PAGE SCRAPED DATA FROM {href} ---\n{scraped_content}"
                                break # Stop after finding one good deep source
                    
                    # Fallback to the very first link if no trusted domains are found
                    if not page_data and results:
                        fallback_href = results[0].get("href", "")
                        scraped_content = fetch_webpage_content(fallback_href)
                        if scraped_content and len(scraped_content) > 1000:
                            page_data = f"--- FULL PAGE SCRAPED DATA FROM {fallback_href} ---\n{scraped_content}"

                if not results and not page_data:
                    yield "I couldn't locate real-time data for that query right now. If you are looking for scores or news, please rephrase your request."
                    return

                # Combine deep data and snippets
                context_data = f"{page_data}\n\n--- SEARCH SNIPPETS ---\n{snippets_data}"

                # 4. The "Perfect AI" System Prompt
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

                # Temperature 0.1 for high factual accuracy but slight conversational tone
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
                    "3. FORMATTING EXCELLENCE: If the user asks for a list, team, or roster, use clean Markdown tables.\n"
                    "4. PROFESSIONAL TONE: Be helpful, direct, and confident. Never lecture the user.\n"
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