'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as text streams in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Voice Input (Microphone Button)
  const toggleVoiceInput = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  // File Attachment (Paperclip Button)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setInput((prev) => `${prev} [Attached File: ${file.name}] `);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userText = input;
    setInput('');

    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setLoading(true);

    try {
      setMessages((prev) => [...prev, { sender: 'ai', text: '' }]);

      const res = await fetch('https://my-ai-agent-8ckl.onrender.com/smart_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      if (!res.ok) throw new Error(`Server status: ${res.status}`);
      if (!res.body) throw new Error('No response body from server.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx] && updated[lastIdx].sender === 'ai') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              text: updated[lastIdx].text + chunk,
            };
          }
          return updated;
        });
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: 'Error connecting to AI backend. Please ensure Render server is awake.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#ffffff', color: '#0d0d0d', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0d0d0d', margin: 0 }}>My AI Agent</h1>
      </header>

      {/* Hidden File Input for Paperclip */}
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />

      {/* Chat Messages Container */}
      <div style={{ flex: 1, maxWidth: '768px', width: '100%', margin: '0 auto', padding: '24px 16px 120px 16px', boxSizing: 'border-box' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '15vh', color: '#666' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#2d2d2d', marginBottom: '8px' }}>What can I help with today?</h2>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '12px 18px',
                  borderRadius: msg.sender === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  backgroundColor: msg.sender === 'user' ? '#f4f4f4' : '#ffffff',
                  color: '#0d0d0d',
                  border: msg.sender === 'ai' ? '1px solid #e5e5e5' : 'none',
                  fontSize: '1rem',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  boxShadow: msg.sender === 'ai' ? '0 2px 6px rgba(0,0,0,0.03)' : 'none',
                }}
              >
                {/* Render Markdown Image if generated */}
                {msg.text.includes('![IMAGE](') ? (
                  <div>
                    <p style={{ margin: '0 0 10px 0' }}>{msg.text.split('![IMAGE](')[0]}</p>
                    <img
                      src={msg.text.split('![IMAGE](')[1]?.replace(')', '')}
                      alt="Generated AI"
                      style={{ maxWidth: '100%', borderRadius: '12px', border: '1px solid #e5e5e5' }}
                    />
                  </div>
                ) : (
                  msg.text || (loading && index === messages.length - 1 ? '...' : '')
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating ChatGPT Input Bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', padding: '12px 16px 24px 16px' }}>
        <div
          style={{
            maxWidth: '768px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#f4f4f4',
            borderRadius: '28px',
            padding: '8px 12px 8px 16px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            border: '1px solid #e5e5e5',
          }}
        >
          {/* Paperclip Attachment Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#676767', display: 'flex', alignItems: 'center' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57a4 4 0 1 1 5.66 5.66l-8.59 8.58a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask anything or generate an image..."
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '1rem',
              color: '#0d0d0d',
              padding: '8px 12px',
            }}
          />

          {/* Microphone Voice Button */}
          <button
            onClick={toggleVoiceInput}
            title="Voice input"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              color: isListening ? '#ef4444' : '#676767',
              display: 'flex',
              alignItems: 'center',
              marginRight: '6px',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>

          {/* Paper Plane Send Icon */}
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            title="Send message"
            style={{
              backgroundColor: input.trim() ? '#000000' : '#e5e5e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() ? 'pointer' : 'default',
              transition: 'background-color 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}