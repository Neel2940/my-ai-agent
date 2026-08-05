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
# Note: The 'duckduckgo_search' package has been renamed to 'ddgs'. 
# This code uses the updated standard for the library.
from ddgs import DDGS

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

def fetch_webpage_content(url: str, max_chars: int = 8000) -> str:
    """Downloads a webpage and extracts clean, readable text."""
    try:
        # Added realistic User-Agent to prevent anti-bot blocking
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=8)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Clean up page structure by removing non-content tags
            for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
                element.decompose()
                
            text = soup.get_text(separator=' ')
            cleaned_text = ' '.join(text.split())
            return cleaned_text[:max_chars]
    except Exception as e:
        print(f"Error fetching URL {url}: {e}")
        pass
    return ""

@app.get("/")
def home():
    return {"status": "Backend running with Advanced Web Scraping & Strict Guardrails!"}

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

    # Contextual check if the previous message triggered an image
    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "Here is a real picture" in history[-2]["content"]

    image_keywords = ["image", "photo", "picture", "pic", "img", "generate", "draw", "create", "paint", "show me"]
    is_image_request = any(k in latest_msg_lower for k in image_keywords) or (
        prev_was_image and not any(k in latest_msg_lower for k in ["explain", "who is", "what is", "tell me", "why"])
    )

    # ---------------------------------------------------------
    # ROUTE 1: AI ART GENERATION
    # ---------------------------------------------------------
    if any(k in latest_msg_lower for k in ["generate", "draw", "create", "paint"]):
        prompt_encoded = urllib.parse.quote_plus(latest_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded}?width=1024&height=1024&nologo=true)"
        def generate_art():
            yield f"Here is your generated AI image:\n\n{img_markdown}"
        return StreamingResponse(generate_art(), media_type="text/event-stream")

    # ---------------------------------------------------------
    # ROUTE 2: REAL WEB PHOTOS
    # ---------------------------------------------------------
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
            # Using updated ddgs library format
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

    # ---------------------------------------------------------
    # ROUTE 3: PERFECT WEB SCRAPER (For accurate lists & real-time info)
    # ---------------------------------------------------------
    elif any(keyword in latest_msg_lower for keyword in [
        "search", "latest", "news", "real time", "current", "today", 
        "squad", "roster", "won", "score", "price of", "2024", "2025", "2026", "2027", "now", "players", "team", "list"
    ]):
        if not client:
            return StreamingResponse(iter(["⚠️ ERROR: GROQ_API_KEY missing. Please configure your backend environment."]), media_type="text/event-stream")
        
        def generate_live():
            try:
                # 1. Ask the AI to build a highly precise web search query
                opt_res = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
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
                    trusted_domains = ["wikipedia.org", "espn", "goal.com", "transfermarkt", "skysports", "bbc", "reuters", "bloomberg"]
                    
                    for item in results:
                        href = item.get("href", "")
                        if any(domain in href.lower() for domain in trusted_domains):
                            scraped_content = fetch_webpage_content(href)
                            if scraped_content and len(scraped_content) > 1000:
                                page_data = f"--- FULL PAGE SCRAPED DATA FROM {href} ---\n{scraped_content}\n\n"
                                break # Stop after finding one good deep source
                                
                    # Fallback to the very first link if no trusted domains are found
                    if not page_data and results:
                         fallback_href = results[0].get("href", "")
                         scraped_content = fetch_webpage_content(fallback_href)
                         if scraped_content and len(scraped_content) > 1000:
                             page_data = f"--- FULL PAGE SCRAPED DATA FROM {fallback_href} ---\n{scraped_content}\n\n"

                # If absolutely nothing is found
                if not results and not page_data:
                    yield "I couldn't locate real-time data for that query right now. If you are looking for specific records, providing a direct URL for me to read works best!"
                    return

                # Combine deep data and snippets
                context_data = f"{page_data}--- SEARCH SNIPPETS ---\n{snippets_data}"

                # 4. The "Perfect AI" System Prompt
                system_prompt = (
                    f"Current Date: {current_date}.\n"
                    f"You are a top-tier, highly accurate AI Assistant.\n"
                    f"Your objective is to answer the user's prompt flawlessly using the following web context:\n\n{context_data}\n\n"
                    f"CRITICAL DIRECTIVES:\n"
                    f"1. ACCURACY OVER EVERYTHING: You must ONLY present information explicitly found in the provided context. \n"
                    f"2. ZERO HALLUCINATION: Do NOT use your pre-trained memory to fill in gaps. If a player, fact, or statistic is not in the text above, DO NOT invent it. Explicitly ignore players who have retired or transferred if asked for a current squad.\n"
                    f"3. FORMATTING EXCELLENCE: If the user asks for a list, team, or roster, you MUST output a beautifully formatted Markdown Table (e.g., | No. | Player | Position |). For other data, use clean bullet points.\n"
                    f"4. PROFESSIONAL TONE: Be helpful, direct, and confident. Never say 'Based on the context provided...' or 'I am an AI...' Just deliver the answer directly."
                )
                
                # Temperature 0.1 for high factual accuracy but slight conversational naturalness
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
                system_instruction = [{"role": "system", "content": f"Current Date: {current_date}. You are a highly capable and intelligent AI assistant. Maintain context across the conversation."}]
                stream = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
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