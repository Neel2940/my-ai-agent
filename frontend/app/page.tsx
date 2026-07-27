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

  // Auto-scroll to bottom when new messages arrive
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
      const res = await fetch('https://my-ai-agent-8ckl.onrender.com/smart_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiFullMessage = "";

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
    <div className="flex h-screen bg-white text-gray-800 font-sans">
      
      {/* Sidebar - Light Theme */}
      <div className="w-64 bg-gray-50 flex flex-col border-r border-gray-200 hidden md:flex">
        <div className="p-3">
          <button
            onClick={createNewChat}
            className="w-full flex items-center gap-2 border border-gray-300 hover:bg-gray-200 text-gray-800 text-sm p-3 rounded-lg transition-colors font-medium shadow-sm bg-white"
          >
            <Plus size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <div className="text-xs text-gray-400 mb-3 px-2 font-semibold uppercase tracking-wider">Recent</div>
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => setCurrentSessionId(session.id)}
              className={`w-full flex items-center gap-2 text-left p-3 text-sm rounded-lg truncate transition-colors ${
                session.id === currentSessionId ? 'bg-gray-200 text-gray-900 font-medium' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <MessageSquare size={16} className="shrink-0" />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area - Clean White Background */}
      <div className="flex-1 flex flex-col h-full relative bg-white">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-36">
          {currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <h2 className="text-3xl font-bold text-gray-800 mb-2">How can I help you today?</h2>
              <p className="text-gray-500 text-sm">Ask a question, brainstorm ideas, or generate content.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {currentSession.messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl max-w-[85%] text-[15px] leading-relaxed ${
                    msg.sender === 'user' 
                      ? 'bg-gray-100 text-gray-900 rounded-br-sm border border-gray-200' 
                      : 'bg-transparent text-gray-800'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Box - Light Theme */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-white via-white to-transparent p-4">
          <div className="max-w-3xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Message your AI..."
              className="w-full bg-white text-gray-900 border border-gray-300 rounded-3xl py-4 pl-6 pr-14 focus:outline-none focus:border-gray-400 shadow-md placeholder-gray-400"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-2.5 p-2.5 bg-black text-white rounded-full hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">AI can make mistakes. Verify important information.</p>
        </div>
      </div>
    </div>
  );
}