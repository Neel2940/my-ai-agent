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

# ---------------------------------------------------------
# 1. SERVER CONFIGURATION & CORS
# ---------------------------------------------------------
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

# ---------------------------------------------------------
# 2. THE REAL-TIME DATA EXTRACTION ENGINE
# ---------------------------------------------------------
def clean_scraped_text(text: str) -> str:
    """Removes Wikipedia citation brackets like [1], [2] and excess whitespace."""
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def fetch_webpage_content(url: str) -> str:
    """Visits a live URL and extracts the readable text, completely bypassing ads and HTML code."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=8)
        if response.status_code != 200:
            return ""
        
        soup = BeautifulSoup(response.text, 'html.parser')

        # EXTREMELY AGGRESSIVE TABLE SNIFFER (For Sports Rosters, Stats, and Financials)
        roster_data = ""
        for table in soup.find_all('table'):
            table_text = table.get_text(separator=' ', strip=True).lower()
            # If the table looks like structured data, rip it out and format it safely
            if any(w in table_text for w in ['player', 'name', 'team', 'date']) and any(w in table_text for w in ['pos', 'position', 'nat', 'nation', 'no.', 'number', 'squad', 'score']):
                for row in table.find_all('tr'):
                    roster_data += row.get_text(separator=' | ', strip=True) + "\n"
                roster_data += "\n"

        # Destroy useless web elements to save AI memory
        for element in soup(["script", "style", "nav", "footer", "header", "noscript", "aside"]):
            element.decompose()

        main_text = soup.get_text(separator=' ')
        clean_main = clean_scraped_text(main_text)

        # Feed the tables explicitly to the AI at the very top
        final_text = f"--- CRITICAL STRUCTURED DATA FROM PAGE ---\n{roster_data}\n--- MAIN PAGE TEXT ---\n{clean_main}"
        return final_text[:15000] # Provide up to 15,000 characters of live data
    except Exception:
        return ""

def search_wikipedia_direct(entity: str) -> str:
    """Directly queries the official Wikipedia API to guarantee we find the right page."""
    try:
        search_term = entity.strip()
        # Auto-correct for football clubs to ensure we don't get Esports or youth teams
        if not any(w in search_term.lower() for w in ["fc", "f.c.", "club"]) and "madrid" in search_term.lower() or "barcelona" in search_term.lower() or "psg" in search_term.lower():
            search_term += " F.C."

        api_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(search_term)}&utf8=&format=json"
        res = requests.get(api_url, headers={'User-Agent': 'MyAIAgent/2.0'}, timeout=5).json()

        results = res.get("query", {}).get("search", [])
        if not results:
            return ""

        # Grab the absolute top result's title
        selected_title = results[0]["title"]
        page_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(selected_title.replace(' ', '_'))}"
        return fetch_webpage_content(page_url)
    except Exception:
        return ""

def extract_clean_subject(text: str) -> str:
    """AI natural language processor: Strips conversational words to find the true search subject."""
    clean = re.sub(r'(?i)\b(give|show|send|get|fetch|me|please|can|you|the|an|a|some|more|another|pictures?|images?|photos?|pics?|imgs?|of|for|about|one|two|three|four|five|2|3|4|5)\b', '', text)
    clean = re.sub(r'[^\w\s]', '', clean).strip()
    return clean if clean else text.strip()

# ---------------------------------------------------------
# 3. FASTAPI ROUTING
# ---------------------------------------------------------
@app.get("/")
def home():
    return {"status": "Ultimate Real-Time AI Agent Online."}

@app.post("/smart_chat")
def smart_chat(req: ChatRequest):
    if not req.messages:
        return {"response": "No message history provided."}

    history = [{"role": m.role, "content": m.content} for m in req.messages]
    latest_msg = history[-1]["content"].strip()
    latest_msg_lower = latest_msg.lower()

    # The AI must know exactly what day it is right now to answer accurately
    current_date = datetime.datetime.now().strftime("%B %d, %Y")
    
    api_key = os.environ.get("GROQ_API_KEY")
    client = Groq(api_key=api_key) if api_key else None

    # Track seen images to avoid showing the user the exact same picture twice
    seen_image_urls = set()
    for msg in history:
        if msg["role"] == "assistant":
            for url in re.findall(r'!\[IMAGE\]\((.*?)\)', msg["content"]):
                seen_image_urls.add(url)

    # Contextual awareness: Did the user just ask for an image in the previous turn?
    prev_was_image = False
    if len(history) >= 2:
        prev_was_image = "![IMAGE]" in history[-2]["content"] or "pictures of" in history[-2]["content"]

    # ---------------------------------------------------------
    # 4. INTENT CLASSIFICATION (The Agent's Brain)
    # ---------------------------------------------------------
    image_pattern = r'\b(image|images|photo|photos|picture|pictures|pic|pics|img|imgs|draw|paint)\b'
    has_image_keyword = bool(re.search(image_pattern, latest_msg_lower))

    # Words that definitively prove the user wants real-world, factual data
    factual_pattern = r'\b(age|how old|height|net worth|born|who is|what is|when|where|explain|squad|roster|team|club|score|players|stats|latest|current|present|news|today|update|price|match|game)\b'
    has_factual_intent = bool(re.search(factual_pattern, latest_msg_lower))

    is_image_request = (has_image_keyword or (prev_was_image and any(k in latest_msg_lower for k in ["another", "more", "next"]))) and not has_factual_intent

    # The master model. Mixtral is used because it has a massive memory context window for reading full webpages
    MODEL_NAME = "gemma2-9b-it"

    # =========================================================
    # ROUTE A: AI ART GENERATOR
    # =========================================================
    if bool(re.search(r'\b(generate|draw|create image|paint)\b', latest_msg_lower)) and not has_factual_intent:
        prompt_encoded = urllib.parse.quote_plus(latest_msg)
        img_markdown = f"![IMAGE](https://image.pollinations.ai/prompt/{prompt_encoded})"
        def generate_art():
            yield f"Here is your generated AI image:\n\n{img_markdown}"
        return StreamingResponse(generate_art(), media_type="text/event-stream")

    # =========================================================
    # ROUTE B: LIVE WEB PHOTO ENGINE
    # =========================================================
    elif is_image_request:
        num_images = 1
        if any(w in latest_msg_lower for w in ["two", "2"]): num_images = 2
        elif any(w in latest_msg_lower for w in ["three", "3"]): num_images = 3
        elif any(w in latest_msg_lower for w in ["four", "4", "five", "5", "more", "multiple"]): num_images = 3

        clean_search = extract_clean_subject(latest_msg)
        if not clean_search and len(history) >= 2:
            clean_search = extract_clean_subject(history[-2]["content"])

        # Ask the LLM to perfect the search string if it's too messy
        if client and len(clean_search.split()) > 4:
            try:
                opt_res = client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=[{"role": "user", "content": f"Extract ONLY the core person or item name for an image search. Return 1-3 words only. Prompt: {latest_msg}"}],
                    temperature=0.0
                )
                extracted = opt_res.choices[0].message.content.strip(' "\'.\n')
                if extracted and len(extracted) < 30:
                    clean_search = extracted
            except Exception:
                pass

        img_list = []
        try:
            # Tap into DuckDuckGo's live image server
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

        # Failsafe Image Generator if DuckDuckGo blocks the request
        if len(img_list) < num_images:
            query_encoded = urllib.parse.quote_plus(clean_search)
            for i in range(len(img_list), num_images):
                fallback_url = f"https://tse1.mm.bing.net/th?q={query_encoded}&w=600&h=400&c=7&rs=1&p=0&dpr=1&pid=1.7&mkt=en-US&adlt=moderate&t={i+1}"
                img_list.append(fallback_url)

        combined_images = "\n\n".join([f"![IMAGE]({url})" for url in img_list])
        title_subject = clean_search.title() if clean_search else "your request"

        def generate_images():
            yield f"Here are {len(img_list)} pictures of {title_subject}:\n\n{combined_images}"
        return StreamingResponse(generate_images(), media_type="text/event-stream")

    # =========================================================
    # ROUTE C: THE AUTONOMOUS REAL-TIME WEB SCRAPER
    # =========================================================
    else:
        if not client:
            return StreamingResponse(iter(["⚠️ GROQ_API_KEY missing from server environment."]), media_type="text/event-stream")

        def generate_universal_chat():
            try:
                # STEP 1: The AI acts as a search strategist. It decides exactly what to Google.
                opt_res = client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=[{"role": "user", "content": f"Convert this user message into a highly effective, concise Google search query to find the most up-to-date real world information. If no search is needed (e.g., general greeting 'hi' or simple math), reply exactly with 'NO_SEARCH'. Message: {latest_msg}"}],
                    temperature=0.0
                )
                search_term = opt_res.choices[0].message.content.replace('"', '').strip().split('\n')[0]

                context_data = ""

                # STEP 2: Scrape the Live Internet based on the AI's query
                if search_term and search_term != "NO_SEARCH" and not "NO_SEARCH" in search_term:
                    
                    # TACTIC A: Deep Wikipedia Scraping (Best for Squads, People, History)
                    if bool(re.search(r'\b(squad|roster|team|club|who is|biography|history of)\b', latest_msg_lower)):
                        wiki_data = search_wikipedia_direct(search_term)
                        if wiki_data:
                            context_data += f"--- WIKIPEDIA DEEP SCRAPE KNOWLEDGE BASE ---\n{wiki_data}\n\n"

                    # TACTIC B: Live News & General Web Search (Best for current events)
                    try:
                        # 1. Fetch live news articles from the last 24 hours
                        if bool(re.search(r'\b(news|latest|today|update|match|score)\b', latest_msg_lower)):
                            news_results = DDGS().news(search_term, max_results=3)
                            if news_results:
                                news_snippets = "\n".join([f"NEWS ({r.get('date')}): {r.get('title')} - {r.get('body')}" for r in news_results])
                                context_data += f"--- LIVE BREAKING NEWS ---\n{news_snippets}\n\n"

                        # 2. Fetch general web search results
                        ddg_results = DDGS().text(search_term, max_results=6)
                        if ddg_results:
                            # Intelligent "Clicking": Automatically open the first highly reliable link
                            for r in ddg_results:
                                href = r.get('href', '')
                                if any(domain in href.lower() for domain in ['goal.com', 'espn', 'transfermarkt', 'skysports', 'bbc', 'cnn', 'nytimes', 'realmadrid', 'forbes']):
                                    page_text = fetch_webpage_content(href)
                                    if len(page_text) > 500:
                                        context_data += f"--- DEEP WEB SCRAPE FROM {href} ---\n{page_text}\n\n"
                                        break # Stop after reading one massive article
                                        
                            # Backup: Feed the Google snippets directly to the AI's brain
                            snippets = "\n".join([f"Source: {r.get('title')} ({r.get('href')}): {r.get('body')}" for r in ddg_results])
                            context_data += f"--- GOOGLE SEARCH SNIPPETS ---\n{snippets}\n\n"
                    except Exception:
                        pass

                # STEP 3: The Final Synthesis (Generating the perfect answer)
                system_prompt = (
                    f"Current Date: {current_date}.\n"
                    "You are a top-tier, world-class AI Assistant with direct access to live internet data.\n\n"
                    "CRITICAL DIRECTIVES:\n"
                    "1. YOU MUST USE THE 'LIVE INTERNET SEARCH DATA' PROVIDED BELOW to answer the user accurately.\n"
                    "2. NEVER apologize for lacking real-time info. NEVER mention a 'knowledge cutoff'. You live in the present.\n"
                    "3. If the scraped data is slightly messy, act like an expert: parse it intelligently, extract the facts, and provide the perfect answer.\n"
                    "4. If the user asks for a sports squad, ALWAYS group players neatly by position with emojis (🥅 Goalkeepers, 🛡️ Defenders, ⚽ Midfielders, 🔥 Forwards) and include jersey numbers.\n"
                    "5. Be confident, highly structured, and directly answer the user's prompt without unnecessary filler.\n"
                    f"\nLIVE INTERNET SEARCH DATA FOR YOU TO READ:\n{context_data if context_data else 'No external data fetched. Rely on internal knowledge.'}"
                )

                stream = client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        *history
                    ],
                    temperature=0.3,
                    stream=True
                )

                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content

            except Exception as e:
                yield f"⚠️ Network Engine Error: {str(e)}"

        return StreamingResponse(generate_universal_chat(), media_type="text/event-stream")