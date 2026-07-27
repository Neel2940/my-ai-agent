'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, MessageSquare, Bot, User, Send, Mic, Volume2, VolumeX } from 'lucide-react';

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('chat_sessions');
    if (saved) {
      const parsed: ChatSession[] = JSON.parse(saved);
      setSessions(parsed);
      if (parsed.length > 0) setCurrentSessionId(parsed[0].id);
    } else {
      createNewChat();
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('chat_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Chat',
      messages: []
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
  };

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  // --- VOICE FEATURE 1: SPEECH-TO-TEXT (Listening) ---
  const handleListen = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Microphone access is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      // Append the spoken words to whatever is already typed in the input box!
      setInput((prev) => prev + (prev ? ' ' : '') + transcript);
    };
    
    recognition.start();
  };

  // --- VOICE FEATURE 2: TEXT-TO-SPEECH (Speaking) ---
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any current speech
      
      // Clean up the text so the AI doesn't read markdown symbols out loud (like "asterisk asterisk")
      const cleanText = text
        .replace(/!\[.*?\]\(.*?\)/g, 'Here is the image you requested.') // Replaces image links
        .replace(/[*#_]/g, ''); // Removes bolding, italics, and headers
        
      const utterance = new SpeechSynthesisUtterance(cleanText);
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech is not supported in this browser.');
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentSessionId) return;

    const userText = input;
    setInput('');

    const updatedMessages: Message[] = [
      ...(currentSession?.messages || []),
      { sender: 'user', text: userText }
    ];

    const updatedTitle = currentSession?.messages.length === 0 
      ? userText.slice(0, 22) + '...' 
      : currentSession?.title || 'New Chat';

    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, title: updatedTitle, messages: updatedMessages }
          : s
      )
    );

    setLoading(true);

    try {
      // Send the entire conversation history to your updated backend!
      const res = await fetch('https://my-ai-agent-8ckl.onrender.com/smart_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userText,
          messages: updatedMessages.map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
          }))
        })
      });
      const data = await res.json();

      const finalMessages: Message[] = [
        ...updatedMessages,
        { sender: 'ai', text: data.response }
      ];

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId ? { ...s, messages: finalMessages } : s
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans">
      {/* SIDEBAR - Clean Black Theme */}
      <div className="w-64 bg-[#171717] p-3 flex flex-col justify-between border-r border-[#2f2f2f]">
        <div>
          <button
            onClick={createNewChat}
            className="flex items-center gap-3 w-full bg-[#212121] hover:bg-[#2f2f2f] text-white p-3 rounded-lg text-sm font-medium mb-4 transition border border-[#383838]"
          >
            <Plus size={18} /> New chat
          </button>

          <p className="text-xs text-gray-400 px-2 mb-2 font-semibold">Recent Chats</p>
          <div className="space-y-1 overflow-y-auto max-h-[75vh]">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setCurrentSessionId(s.id)}
                className={`flex items-center gap-3 w-full p-2.5 rounded-lg text-sm truncate transition ${
                  s.id === currentSessionId
                    ? 'bg-[#2f2f2f] text-white font-medium'
                    : 'hover:bg-[#212121] text-gray-400'
                }`}
              >
                <MessageSquare size={16} />
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CHAT AREA - Pristine White Theme */}
      <div className="flex-1 flex flex-col justify-between">
        <div className="overflow-y-auto space-y-6 p-6 max-w-4xl mx-auto w-full flex-1">
          {currentSession?.messages.length === 0 && (
            <div className="text-center mt-20 text-gray-700">
              <h1 className="text-3xl font-semibold mb-2">How can I help you today?</h1>
              <p className="text-sm">Ask questions, search the web, generate images, or talk to me!</p>
            </div>
          )}

          {currentSession?.messages.map((m, i) => (
            <div key={i} className="flex gap-4 items-start">
              <div className={`p-2 rounded-full ${m.sender === 'user' ? 'bg-gray-200 text-gray-700' : 'bg-black text-white'}`}>
                {m.sender === 'user' ? <User size={18} /> : <Bot size={18} />}
              </div>
              <div className={`flex-1 p-4 rounded-2xl text-gray-900 leading-relaxed ${m.sender === 'user' ? 'bg-gray-100' : 'bg-white border border-gray-100 shadow-sm'}`}>
                <ReactMarkdown>{m.text}</ReactMarkdown>
                
                {/* Voice Control Buttons on AI Messages */}
                {m.sender === 'ai' && (
                  <div className="flex gap-3 mt-4 pt-3 border-t border-gray-100 text-gray-400">
                    <button onClick={() => speakText(m.text)} className="flex items-center gap-1 hover:text-black transition text-xs font-medium" title="Read Aloud">
                      <Volume2 size={14} /> Read Aloud
                    </button>
                    <button onClick={stopSpeaking} className="flex items-center gap-1 hover:text-red-500 transition text-xs font-medium" title="Stop Reading">
                      <VolumeX size={14} /> Stop
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-4 items-center text-gray-500 italic">
              <div className="p-2 rounded-full bg-black text-white">
                 <Bot size={18} />
              </div>
              <p className="animate-pulse">Generating perfect response...</p>
            </div>
          )}
        </div>

        {/* INPUT BAR - Clean Grey/White Theme */}
        <div className="p-4 bg-white">
          <div className="max-w-3xl mx-auto flex bg-gray-100 rounded-3xl p-2 border border-gray-300 focus-within:border-gray-500 transition shadow-sm items-center gap-2">
            
            {/* Microphone Button */}
            <button
              onClick={handleListen}
              className={`p-2.5 rounded-full transition flex items-center justify-center ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-transparent text-gray-500 hover:bg-gray-200'
              }`}
              title="Click to speak"
            >
              <Mic size={20} />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={isListening ? "Listening..." : "Message your AI..."}
              className="flex-1 bg-transparent px-2 py-2 outline-none text-gray-900 placeholder-gray-500"
            />

            <button
              onClick={sendMessage}
              className="bg-black hover:bg-gray-800 text-white p-2.5 rounded-full transition flex items-center justify-center"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}