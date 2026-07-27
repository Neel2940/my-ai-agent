'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Plus, MessageSquare } from 'lucide-react';

type Message = {
  sender: 'user' | 'ai';
  text: string;
};

type Session = {
  id: string;
  title: string;
  messages: Message[];
};

export default function Home() {
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<Session[]>([{ id: '1', title: 'New Chat', messages: [] }]);
  const [currentSessionId, setCurrentSessionId] = useState('1');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];

  // Auto-scroll to the bottom when a new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession.messages]);

  const createNewChat = () => {
    const newSession = { id: Date.now().toString(), title: 'New Chat', messages: [] };
    setSessions([newSession, ...sessions]);
    setCurrentSessionId(newSession.id);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setLoading(true);

    const updatedTitle = currentSession.messages.length === 0 ? userText.slice(0, 22) + '...' : currentSession.title;

    // Add user message AND an empty placeholder for the AI message
    const newMessages: Message[] = [
      ...currentSession.messages,
      { sender: 'user', text: userText },
      { sender: 'ai', text: '' } 
    ];

    setSessions(prev =>
      prev.map(s =>
        s.id === currentSessionId ? { ...s, title: updatedTitle, messages: newMessages } : s
      )
    );

    try {
      // Calls your live Render backend
      const res = await fetch('https://my-ai-agent-8ckl.onrender.com/smart_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiFullMessage = "";

      // Loop through the stream and update the UI word-by-word
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        aiFullMessage += chunk;

        setSessions(prev =>
          prev.map(s => {
            if (s.id === currentSessionId) {
              const updatedMessages = [...s.messages];
              updatedMessages[updatedMessages.length - 1].text = aiFullMessage;
              return { ...s, messages: updatedMessages };
            }
            return s;
          })
        );
      }
    } catch (error) {
      console.error("Error connecting to AI:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#212121] text-gray-100 font-sans">
      
      {/* Sidebar */}
      <div className="w-64 bg-[#171717] flex flex-col border-r border-gray-700 hidden md:flex">
        <div className="p-3">
          <button
            onClick={createNewChat}
            className="w-full flex items-center gap-2 hover:bg-[#2f2f2f] text-sm p-3 rounded-md transition-colors"
          >
            <Plus size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <div className="text-xs text-gray-500 mb-3 px-2 font-semibold">Recent</div>
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => setCurrentSessionId(session.id)}
              className={`w-full flex items-center gap-2 text-left p-3 text-sm rounded-md truncate transition-colors ${
                session.id === currentSessionId ? 'bg-[#2f2f2f]' : 'hover:bg-[#212121]'
              }`}
            >
              <MessageSquare size={16} className="shrink-0" />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-36">
          {currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <h2 className="text-3xl font-semibold mb-4">How can I help you today?</h2>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {currentSession.messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl max-w-[85%] text-[15px] leading-relaxed ${
                    msg.sender === 'user' 
                      ? 'bg-[#2f2f2f] text-white rounded-br-sm' 
                      : 'bg-transparent text-gray-200'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Box */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#212121] via-[#212121] to-transparent p-4">
          <div className="max-w-3xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Message your AI..."
              className="w-full bg-[#2f2f2f] text-white border border-gray-700 rounded-3xl py-4 pl-6 pr-14 focus:outline-none focus:border-gray-500 shadow-xl"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-2 p-2 bg-white text-black rounded-full hover:bg-gray-200 disabled:bg-gray-600 disabled:text-gray-400 transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-center text-xs text-gray-500 mt-3">AI can make mistakes. Verify important information.</p>
        </div>
      </div>
    </div>
  );
}