import os
import json
import random
import requests
import urllib.parse
import io
import PyPDF2 # NEW: The PDF Reader!
from fastapi import FastAPI, UploadFile, File # NEW: Added UploadFile and File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

# Load environment variables from .env
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. THE TOOLS ---

@tool
def generate_image(prompt: str) -> str:
    """Use ONLY for fictional/fantasy concepts, anime/drawings, sci-fi."""
    encoded_prompt = urllib.parse.quote(prompt)
    image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&model=flux&nologo=true"
    return f"CRITICAL INSTRUCTION: Paste this exact markdown in your final response:\n\n![{prompt}]({image_url})"

@tool
def fetch_real_image(query: str) -> str:
    """Use this to fetch REAL photographs of ANYTHING: laptops, cars, people, gadgets, places, products, etc."""
    try:
        clean_query = query.strip()
        api_key = os.getenv("SERPER_API_KEY")
        
        if not api_key:
            return "SERPER_API_KEY is missing from .env file."

        url = "https://google.serper.dev/images"
        payload = json.dumps({"q": clean_query})
        headers = {
            'X-API-KEY': api_key,
            'Content-Type': 'application/json'
        }
        
        response = requests.post(url, headers=headers, data=payload, timeout=8)
        response_data = response.json()
        
        images = response_data.get("images", [])
        
        if images:
            top_images = images[:10]
            chosen_images = random.sample(top_images, min(2, len(top_images)))
            
            markdown_response = "SUCCESS! I found the images. YOU MUST COPY AND PASTE THESE EXACT LINKS AT THE TOP OF YOUR FINAL RESPONSE TO THE USER:\n\n"
            for img in chosen_images:
                markdown_response += f"![{clean_query}]({img['imageUrl']})\n\n"
                
            return markdown_response
        else:
            return f"(No images found for {clean_query})"

    except Exception as e:
        return f"(Image fetch error: {str(e)})"

@tool
def safe_web_search(query: str) -> str:
    """Use this tool to search Google for real-time live events, breaking news, or specific current data."""
    try:
        api_key = os.getenv("SERPER_API_KEY")
        if not api_key:
            return "Serper API key missing."
            
        url = "https://google.serper.dev/search"
        payload = json.dumps({"q": query})
        headers = {
            'X-API-KEY': api_key,
            'Content-Type': 'application/json'
        }
        
        response = requests.post(url, headers=headers, data=payload, timeout=8)
        data = response.json()
        
        snippets = []
        if "organic" in data:
            for item in data["organic"][:4]:
                snippets.append(f"- **{item.get('title')}**: {item.get('snippet')}")
                
        return "\n".join(snippets) if snippets else "No search results found."
    except Exception as e:
        return f"Search error: {str(e)}"


# --- 2. THE BRAIN & INTERNAL MEMORY ---

llm = ChatGroq(model="llama-3.3-70b-versatile")
tools = [safe_web_search, generate_image, fetch_real_image]
memory = MemorySaver()

system_prompt = """You are an extraordinarily smart, highly versatile AI assistant like ChatGPT.

CRITICAL RULES:
1. ALWAYS remember what the user just asked in the previous messages.
2. If the user asks for an image, photo, or picture, YOU MUST CALL 'fetch_real_image'.
3. When the image tool returns links, YOU MUST PASTE THEM EXACTLY AS WRITTEN at the very top of your text output. Do not hide them!
4. After pasting the images, write your detailed text explanation, features, and functions below them."""

agent_executor = create_react_agent(llm, tools, prompt=system_prompt, checkpointer=memory)


# --- 3. THE CONNECTIONS (Endpoints) ---

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        config = {"configurable": {"thread_id": "user_session_1"}}
        response = agent_executor.invoke({"messages": [("user", request.message)]}, config=config)
        return {"response": response["messages"][-1].content}
    except Exception as e:
        try:
            fallback_response = llm.invoke(request.message)
            return {"response": fallback_response.content}
        except Exception:
            return {"response": "I'm sorry, I ran into an unexpected glitch. Please try asking again!"}

# NEW: The PDF Upload Endpoint!
@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    try:
        # 1. Read the uploaded PDF file
        contents = await file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(contents))
        
        extracted_text = ""
        for page in pdf_reader.pages:
            if page.extract_text():
                extracted_text += page.extract_text() + "\n"
                
        # 2. Silently feed the text into the AI's memory thread!
        config = {"configurable": {"thread_id": "user_session_1"}}
        
        # We tell the AI to read it and say hello!
        prompt = f"System Instruction: The user just uploaded a document named '{file.filename}'. Here is the text inside it:\n\n{extracted_text}\n\nAcknowledge that you have received and read the document '{file.filename}', summarize what it is generally about in one sentence, and tell the user you are ready to answer questions about it."
        
        response = agent_executor.invoke({"messages": [("user", prompt)]}, config=config)
        return {"response": response["messages"][-1].content}
        
    except Exception as e:
        return {"response": f"I couldn't read that document. Error details: {str(e)}"}