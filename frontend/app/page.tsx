'use client';

import { useState } from 'react';

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userText = input;
    setInput('');

    // 1. Add User Message
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setLoading(true);

    try {
      // 2. Add empty AI placeholder message
      setMessages((prev) => [...prev, { sender: 'ai', text: '' }]);

      // 3. Connect to Render backend
      const res = await fetch('https://my-ai-agent-8ckl.onrender.com/smart_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      if (!res.ok) {
        throw new Error(`Server status: ${res.status}`);
      }

      if (!res.body) throw new Error('No response body from server.');

      // 4. Read streaming chunks
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Append chunk to the last AI message
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
        { sender: 'ai', text: 'Error connecting to AI backend. Please wait a moment for Render to wake up.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#ffffff', color: '#202123', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '1px solid #e5e5e5', paddingBottom: '10px' }}>
        <h2 style={{ color: '#202123', margin: 0 }}>My AI Agent</h2>
      </header>

      <div style={{ maxWidth: '750px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '15px', minHeight: '65vh' }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.sender === 'user' ? '#10a37f' : '#f7f7f8',
              color: msg.sender === 'user' ? '#ffffff' : '#202123',
              border: msg.sender === 'ai' ? '1px solid #e5e5e5' : 'none',
              padding: '14px 18px',
              borderRadius: '12px',
              maxWidth: '85%',
              whiteSpace: 'pre-wrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <strong>{msg.sender === 'user' ? 'You: ' : 'AI: '}</strong>
            
            {/* Check if AI returned a Markdown Image */}
            {msg.text.includes('![IMAGE](') ? (
              <div>
                <p>{msg.text.split('![IMAGE](')[0]}</p>
                <img
                  src={msg.text.split('![IMAGE](')[1]?.replace(')', '')}
                  alt="Generated AI"
                  style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '10px', border: '1px solid #e5e5e5' }}
                />
              </div>
            ) : (
              msg.text
            )}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: '750px', margin: '20px auto 0', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask a question or generate an image..."
          style={{
            flex: 1,
            padding: '14px',
            borderRadius: '8px',
            border: '1px solid #d9d9e3',
            backgroundColor: '#ffffff',
            color: '#202123',
            outline: 'none',
            fontSize: '1rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          style={{
            padding: '14px 24px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#10a37f',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}