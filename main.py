from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import requests
import urllib.parse
from groq import Groq

# Initialize the FastAPI app
app = FastAPI()

# Initialize the Groq client (requires GROQ_API_KEY environment variable on Render)
try:
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
except Exception:
    # Fallback for local testing if env var isn't set
    print("Warning: GROQ_API_KEY not found in environment. Chat function may fail.")
    client = None

# Define what the incoming chat data looks like
class ChatRequest(BaseModel):
    message: str

# System instructions to make Groq smart about images
SYSTEM_PROMPT = """You are a helpful AI assistant. You have a special skill: you can generate images!

If the user asks you to 'generate an image', 'draw', or 'create a picture' of something, follow these rules exactly:
1. Don't respond with text saying you are generating the image.
2. Formulate a good, short, descriptive prompt for the image.
3. Your final response to the user must ONLY be this exact Markdown format: `![IMAGE](https://image.pollinations.ai/prompt/<PROMPT_TEXT>?width=1024&height=1024&nologo=true)`
4. Replace `<PROMPT_TEXT>` in the URL with your sanitized and URL-encoded image prompt. Ensure there are no spaces or special characters in the prompt part of the URL (they must be encoded, e.g., 'a red cat' becomes 'a+red+cat' or 'a%20red%20cat').
5. If the user just wants to chat, respond normally with text."""

# Helper function to sanitize text for URLs
def sanitize_prompt(text):
    return urllib.parse.quote_plus(text)

# 1. THE FRONTEND UI (The new clean, dark-mode ChatGPT layout)
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    # This serves the user-friendly interface directly
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>My AI Agent - Home</title>
        <style>
            :root {
                --bg-color: #343541;
                --user-msg-bg: #444654;
                --ai-msg-bg: #343541;
                --border-color: #565869;
                --text-color: #ECECF1;
                --accent-color: #19c37d;
            }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
            header { background: var(--ai-msg-bg); padding: 15px; border-bottom: 1px solid var(--border-color); text-align: center; }
            h1 { font-size: 1.2rem; margin: 0; }
            #chat-container { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 20px 10px; width: 100%; max-width: 800px; margin: 0 auto; box-sizing: border-box; }
            .message { padding: 12px; border-radius: 8px; margin-bottom: 5px; width: fit-content; max-width: 85%; }
            .user-message { background-color: var(--user-msg-bg); align-self: flex-end; border-top-right-radius: 0; }
            .ai-message { background-color: var(--ai-msg-bg); border: 1px solid var(--border-color); align-self: flex-start; border-top-left-radius: 0; white-space: pre-wrap; }
            .message-label { font-size: 0.8rem; font-weight: bold; margin-bottom: 5px; color: #a1a1aa; }
            .user-message .message-label { text-align: right; }
            .chat-image { max-width: 100%; height: auto; border-radius: 8px; margin-top: 10px; border: 1px solid var(--border-color); display: block; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
            #input-container { position: sticky; bottom: 0; width: 100%; background: var(--bg-color); padding: 15px 0 30px; border-top: 1px solid var(--border-color); }
            #input-wrapper { display: flex; align-items: center; justify-content: center; width: 100%; max-width: 800px; margin: 0 auto; padding: 0 10px; box-sizing: border-box; }
            #userInput { width: 100%; padding: 14px; border-radius: 8px; border: 1px solid var(--border-color); background: #40414f; color: var(--text-color); outline: none; font-size: 1rem; }
            #userInput:focus { border-color: var(--accent-color); }
            #sendBtn { padding: 14px 20px; margin-left: 10px; border-radius: 8px; border: none; background: var(--accent-color); color: white; font-weight: bold; cursor: pointer; transition: background 0.3s; }
            #sendBtn:hover { background: #1a9a66; }
            /* Custom scrollbar */
            ::-webkit-scrollbar { width: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #565869; border-radius: 3px; }
            ::-webkit-scrollbar-thumb:hover { background: #a1a1aa; }
        </style>
    </head>
    <body>
        <header>
            <h1>My AI Agent</h1>
        </header>
        <div id="chat-container">
            <!-- Starting AI Message -->
            <div class="message ai-message">
                <div class="message-label">AI</div>
                Hello! I am your AI assistant with image generation powers. Try asking me "Generate an image of a red cat"!
            </div>
        </div>
        <div id="input-container">
            <div id="input-wrapper">
                <input type="text" id="userInput" placeholder="Send a message..." onkeydown="if(event.key==='Enter') sendMessage()">
                <button id="sendBtn" onclick="sendMessage()">Send</button>
            </div>
        </div>
        <script>
            function addMessage(text, isUser = false) {
                const container = document.getElementById("chat-container");
                const messageDiv = document.createElement("div");
                messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
                
                const labelDiv = document.createElement("div");
                labelDiv.className = 'message-label';
                labelDiv.textContent = isUser ? 'You' : 'AI';
                messageDiv.appendChild(labelDiv);

                // Detect Markdown Images: ![alt](url)
                const markdownImageRegex = /\\!\\[IMAGE\\]\\((https?:\\/\\/\\S+?)\\)/;
                const match = text.match(markdownImageRegex);

                if (match) {
                    // It's an image response
                    const textBeforeImage = text.replace(markdownImageRegex, '').trim();
                    if (textBeforeImage) {
                        const textSpan = document.createElement("span");
                        textSpan.textContent = textBeforeImage;
                        messageDiv.appendChild(textSpan);
                        messageDiv.appendChild(document.createElement("br"));
                    }
                    const img = document.createElement("img");
                    img.src = match[1];
                    img.alt = "Generated Image";
                    img.className = 'chat-image';
                    img.onerror = () => { img.alt="Error loading image. (Often resolves itself in 10 seconds)"; }
                    messageDiv.appendChild(img);
                } else {
                    // Regular text response
                    const textSpan = document.createElement("span");
                    textSpan.textContent = text;
                    messageDiv.appendChild(textSpan);
                }

                container.appendChild(messageDiv);
                container.scrollTop = container.scrollHeight;
            }

            async function sendMessage() {
                const input = document.getElementById("userInput");
                if (!input.value.trim()) return;

                const userText = input.value;
                addMessage(userText, true);
                input.value = ""; // Clear input box

                try {
                    // 2. Call the new consolidated endpoint
                    const response = await fetch("/smart_chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ message: userText })
                    });

                    const data = await response.json();
                    
                    if (data.response) {
                        addMessage(data.response);
                    } else if (data.imageUrl) {
                        // Special handling if a direct image URL was somehow returned
                        addMessage(`![IMAGE](${data.imageUrl})`);
                    } else if (data.error) {
                        addMessage(`Error: ${data.error}`);
                    } else {
                        addMessage(`Unknown response: ${JSON.stringify(data)}`);
                    }
                } catch (error) {
                    addMessage(`Error connecting to AI. Please ensure you added requests to your requirements.txt!`);
                    console.error(error);
                }
            }
        </script>
    </body>
    </html>
    """
    return html_content

# 2. THE SMARTER BACKEND API (Handles Chat AND Intent Detection)
@app.post("/smart_chat")
async def smart_chat_endpoint(req: ChatRequest):
    if not client:
         raise HTTPException(status_code=500, detail="Groq client is not configured. Add GROQ_API_KEY to environment variables.")
    
    try:
        # Send the user's message + System Prompt to Groq
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": req.message,
                }
            ],
            # Use a fast, good model (Mistral, Llama3-8b, or Llama3-70b are best)
            model="llama3-8b-8192", 
            temperature=0.7,
        )
        
        # Get the AI text response
        ai_response_text = chat_completion.choices[0].message.content
        
        # Return the raw response. The frontend JavaScript in `addMessage` 
        # is upgraded to automatically detect Markdown images inside this text.
        return {"response": ai_response_text}

    except Exception as e:
        # Print actual error safely
        print(f"Chat Error: {e}")
        return {"error": str(e)}

# Keep the original endpoints in case external services use them
@app.post("/chat")
def legacy_chat_endpoint(req: ChatRequest):
     return {"response": "This endpoint is deprecated. Use '/smart_chat' or visit the web UI."}

# Image generation endpoint is now implicitly handled via /smart_chat instructions