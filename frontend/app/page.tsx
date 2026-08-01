'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'library' | 'projects' | 'plugins' | 'more'>('chat');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('my_ai_agent_sessions');
    if (saved) {
      try {
        const parsed: ChatSession[] = JSON.parse(saved);
        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
          return;
        }
      } catch (e) {
        console.error('Failed to parse saved sessions', e);
      }
    }
    createNewChat();
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('my_ai_agent_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setActiveTab('chat');
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    if (updated.length > 0) {
      if (currentSessionId === id) {
        setCurrentSessionId(updated[0].id);
      }
    } else {
      createNewChat();
    }
  };

  const toggleVoiceInput = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
    if (isListening) recognition.stop();
    else recognition.start();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setInput((prev) => `${prev} [Attached File: ${file.name}] `);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !currentSessionId) return;

    const userText = input;
    setInput('');

    const updatedMessages: Message[] = [...messages, { sender: 'user', text: userText }];

    let updatedTitle = currentSession?.title || 'New Chat';
    if (messages.length === 0) {
      updatedTitle = userText.length > 24 ? userText.substring(0, 24) + '...' : userText;
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, title: updatedTitle, messages: updatedMessages }
          : s
      )
    );
    setLoading(true);

    try {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: [...updatedMessages, { sender: 'ai', text: '' }] }
            : s
        )
      );

      const formattedHistory = updatedMessages.map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await fetch('https://my-ai-agent-8ckl.onrender.com/smart_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: formattedHistory }),
      });

      if (!res.ok) throw new Error(`Server Error (${res.status})`);

      const data = await res.json();
      const aiReply = data.response || 'No response received.';

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== currentSessionId) return s;
          const updated = [...s.messages];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx] && updated[lastIdx].sender === 'ai') {
            updated[lastIdx] = { ...updated[lastIdx], text: aiReply };
          }
          return { ...s, messages: updated };
        })
      );
    } catch (error: any) {
      console.error(error);
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== currentSessionId) return s;
          const updated = [...s.messages];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx] && updated[lastIdx].sender === 'ai') {
            updated[lastIdx] = { ...updated[lastIdx], text: `⚠️ ERROR: ${error.message}` };
          }
          return { ...s, messages: updated };
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#ffffff', color: '#0d0d0d', minHeight: '100vh', display: 'flex', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .sidebar-item:hover { background-color: #f4f4f4; }
        .delete-btn { opacity: 0; transition: opacity 0.2s; }
        .recent-row:hover .delete-btn { opacity: 1; }
      `}</style>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40 }}
        />
      )}

      <aside
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: sidebarOpen ? 0 : '-300px',
          width: '300px',
          backgroundColor: '#fafafa',
          borderRight: '1px solid #e5e5e5',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          transition: 'left 0.25s ease',
          padding: '16px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#0d0d0d' }}>ChatGPT</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => alert('Search feature coming soon!')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#666' }}
              title="Search chats"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#666' }}
              title="Close sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
          <div
            onClick={() => { setActiveTab('library'); alert('Library Section'); }}
            className="sidebar-item"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', color: '#333', fontWeight: 500 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>Library</span>
          </div>
          <div
            onClick={() => { setActiveTab('projects'); alert('Projects Section'); }}
            className="sidebar-item"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', color: '#333', fontWeight: 500 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>Projects</span>
          </div>
          <div
            onClick={() => { setActiveTab('plugins'); alert('Plugins Section'); }}
            className="sidebar-item"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', color: '#333', fontWeight: 500 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <span>Plugins</span>
          </div>
          <div
            onClick={() => { setActiveTab('more'); alert('More Options'); }}
            className="sidebar-item"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', color: '#333', fontWeight: 500 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            <span>More</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#888', marginBottom: '8px', paddingLeft: '8px', textTransform: 'uppercase' }}>
            Recents
          </div>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => {
                setCurrentSessionId(s.id);
                setActiveTab('chat');
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              className="recent-row sidebar-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: s.id === currentSessionId && activeTab === 'chat' ? '#e9e9e9' : 'transparent',
                fontSize: '0.9rem',
                color: '#2d2d2d',
                marginBottom: '2px',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {s.title}
              </span>
              <button
                onClick={(e) => deleteChat(s.id, e)}
                className="delete-btn"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444' }}
                title="Delete chat"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #e5e5e5' }}>
          <button
            onClick={createNewChat}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#1d6bf3',
              color: '#ffffff',
              border: 'none',
              borderRadius: '20px',
              padding: '10px 18px',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(29, 107, 243, 0.3)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span>Chat</span>
          </button>

          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#6b21a8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
            NP
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
        <header style={{ padding: '12px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#333' }}
            title="Toggle Sidebar"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0d0d0d', margin: 0 }}>
            {currentSession?.title || 'My AI Agent'}
          </h1>
          <button
            onClick={createNewChat}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#333' }}
            title="New Chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </header>

        <div style={{ flex: 1, maxWidth: '768px', width: '100%', margin: '0 auto', padding: '24px 16px 120px 16px', boxSizing: 'border-box' }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '18vh', color: '#666' }}>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#2d2d2d', marginBottom: '8px' }}>What can I help with today?</h2>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start', marginBottom: '20px' }}>
                <div style={{ maxWidth: '85%', padding: '12px 18px', borderRadius: msg.sender === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px', backgroundColor: msg.sender === 'user' ? '#f4f4f4' : '#ffffff', color: '#0d0d0d', border: msg.sender === 'ai' ? '1px solid #e5e5e5' : 'none', fontSize: '1rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', boxShadow: msg.sender === 'ai' ? '0 2px 6px rgba(0,0,0,0.03)' : 'none' }}>
                  {msg.sender === 'ai' && msg.text === '' && loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', animation: 'pulse 1.5s infinite' }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10a37f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M12 12 2.1 7.1" /><path d="m12 12 9.9 4.9" /></svg>
                      <span style={{ color: '#666', fontStyle: 'italic', fontSize: '0.95rem' }}>Thinking...</span>
                    </div>
                  ) : (
                    msg.text.includes('![IMAGE](') ? (
                      <div>
                        <p style={{ margin: '0 0 10px 0' }}>{msg.text.split('![IMAGE](')[0]}</p>
                        <img src={msg.text.split('![IMAGE](')[1]?.replace(')', '')} alt="Generated AI" style={{ maxWidth: '100%', borderRadius: '12px', border: '1px solid #e5e5e5' }} />
                      </div>
                    ) : (msg.text)
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', padding: '12px 16px 24px 16px' }}>
          <div style={{ maxWidth: '768px', margin: '0 auto', display: 'flex', alignItems: 'center', backgroundColor: '#f4f4f4', borderRadius: '28px', padding: '8px 12px 8px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #e5e5e5' }}>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()} title="Attach file" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#676767', display: 'flex', alignItems: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57a4 4 0 1 1 5.66 5.66l-8.59 8.58a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Ask anything or generate an image..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '1rem', color: '#0d0d0d', padding: '8px 12px' }} />
            <button onClick={toggleVoiceInput} title="Voice input" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: isListening ? '#ef4444' : '#676767', display: 'flex', alignItems: 'center', marginRight: '6px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
            </button>
            <button onClick={sendMessage} disabled={!input.trim() || loading} title="Send message" style={{ backgroundColor: input.trim() ? '#000000' : '#e5e5e5', color: '#ffffff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', transition: 'background-color 0.2s' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}