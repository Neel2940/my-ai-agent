'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('my_ai_agent_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
          return;
        }
      } catch (e) {}
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
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    if (updated.length > 0) {
      if (currentSessionId === id) setCurrentSessionId(updated[0].id);
    } else {
      createNewChat();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setInput((prev) => `${prev} [Attached File: ${file.name}] `);
  };

  const handleCardClick = (text: string) => {
    setInput(text);
    // Optional: You can also immediately call sendMessage() here if you want it to auto-send
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !currentSessionId) return;

    const userText = input;
    setInput('');

    const updatedMessages: Message[] = [...messages, { sender: 'user', text: userText }];
    let updatedTitle = currentSession?.title || 'New Chat';
    if (messages.length === 0) {
      updatedTitle = userText.length > 28 ? userText.substring(0, 28) + '...' : userText;
    }

    setSessions((prev) =>
      prev.map((s) => (s.id === currentSessionId ? { ...s, title: updatedTitle, messages: updatedMessages } : s))
    );
    setLoading(true);

    try {
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { ...s, messages: [...updatedMessages, { sender: 'ai', text: '' }] } : s))
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

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedText += decoder.decode(value, { stream: true });

          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== currentSessionId) return s;
              const updated = [...s.messages];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx] && updated[lastIdx].sender === 'ai') {
                updated[lastIdx] = { ...updated[lastIdx], text: accumulatedText };
              }
              return { ...s, messages: updated };
            })
          );
        }
      }
    } catch (error: any) {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== currentSessionId) return s;
          const updated = [...s.messages];
          updated[updated.length - 1] = { sender: 'ai', text: `⚠️ ERROR: ${error.message}` };
          return { ...s, messages: updated };
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#ffffff', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      
      {/* GLOBAL STYLES FOR MARKDOWN */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; color: #0d0d0d; }
        
        /* Markdown Styling */
        .markdown-body { line-height: 1.7; font-size: 1rem; color: #2d2d2d; }
        .markdown-body p { margin-bottom: 1rem; }
        .markdown-body strong { font-weight: 600; color: #000; }
        .markdown-body a { color: #10a37f; text-decoration: none; }
        .markdown-body ul, .markdown-body ol { margin-bottom: 1rem; padding-left: 1.5rem; }
        .markdown-body li { margin-bottom: 0.5rem; }
        
        /* Table Styling */
        .markdown-body table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; border-radius: 8px; overflow: hidden; box-shadow: 0 0 0 1px #e5e5e5; }
        .markdown-body th, .markdown-body td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
        .markdown-body th { background-color: #f9f9f9; font-weight: 600; color: #444; }
        .markdown-body tr:last-child td { border-bottom: none; }
        
        /* Code Blocks */
        .markdown-body pre { background-color: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; margin-bottom: 1rem; font-family: monospace; font-size: 0.9rem; }
        .markdown-body code { background-color: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
        
        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d1d1d1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
        
        .nav-item:hover { background-color: #ececec; }
        .suggestion-card { transition: all 0.2s ease; }
        .suggestion-card:hover { background-color: #f9f9f9; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
      `}</style>

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
      )}

      {/* DARK MODE SIDEBAR */}
      <aside style={{ position: 'fixed', top: 0, bottom: 0, left: sidebarOpen ? 0 : '-280px', width: '280px', backgroundColor: '#171717', color: '#ececec', display: 'flex', flexDirection: 'column', zIndex: 50, transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)', padding: '16px 12px' }}>
        
        <button onClick={createNewChat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'transparent', border: '1px solid #444', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', marginBottom: '24px', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            New Chat
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', marginBottom: '10px', paddingLeft: '8px', letterSpacing: '0.5px' }}>Recent</div>
          {sessions.map((s) => (
            <div key={s.id} onClick={() => { setCurrentSessionId(s.id); if (window.innerWidth < 768) setSidebarOpen(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', backgroundColor: s.id === currentSessionId ? '#2a2a2a' : 'transparent', fontSize: '0.9rem', color: s.id === currentSessionId ? '#fff' : '#c5c5c5', marginBottom: '4px' }} className="nav-item">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.title}</span>
              <button onClick={(e) => deleteChat(s.id, e)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#10a37f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.85rem' }}>NP</div>
          <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#ececec' }}>Neel Patel</span>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: window.innerWidth > 768 ? '280px' : '0', transition: 'margin 0.3s' }}>
        
        {/* MOBILE HEADER */}
        <header style={{ display: window.innerWidth > 768 ? 'none' : 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e5e5e5', backgroundColor: '#fff' }}>
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', padding: '4px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <h1 style={{ margin: '0 auto', fontSize: '1rem', fontWeight: 600, color: '#333' }}>My AI Agent</h1>
        </header>

        {/* SCROLLABLE CHAT CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 140px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          {messages.length === 0 ? (
            /* EMPTY STATE & SUGGESTIONS */
            <div style={{ width: '100%', maxWidth: '768px', margin: 'auto', textAlign: 'center', marginTop: '10vh' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#000', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 7.1"/><path d="m12 12 9.9 4.9"/></svg>
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 600, color: '#0d0d0d', marginBottom: '40px' }}>How can I help you today?</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', textAlign: 'left' }}>
                <div onClick={() => handleCardClick('Give me the present team of Real Madrid club')} className="suggestion-card" style={{ padding: '16px', border: '1px solid #e5e5e5', borderRadius: '12px', cursor: 'pointer' }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#2d2d2d', marginBottom: '4px' }}>Real Madrid Squad</p>
                  <p style={{ fontSize: '0.85rem', color: '#888' }}>Get the latest 2026-27 roster</p>
                </div>
                <div onClick={() => handleCardClick('Summarize the latest artificial intelligence news')} className="suggestion-card" style={{ padding: '16px', border: '1px solid #e5e5e5', borderRadius: '12px', cursor: 'pointer' }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#2d2d2d', marginBottom: '4px' }}>AI News Summary</p>
                  <p style={{ fontSize: '0.85rem', color: '#888' }}>Catch up on tech trends</p>
                </div>
                <div onClick={() => handleCardClick('Write a Python script to scrape a website')} className="suggestion-card" style={{ padding: '16px', border: '1px solid #e5e5e5', borderRadius: '12px', cursor: 'pointer' }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#2d2d2d', marginBottom: '4px' }}>Code a Web Scraper</p>
                  <p style={{ fontSize: '0.85rem', color: '#888' }}>Python BeautifulSoup example</p>
                </div>
                <div onClick={() => handleCardClick('Generate a beautiful futuristic city landscape')} className="suggestion-card" style={{ padding: '16px', border: '1px solid #e5e5e5', borderRadius: '12px', cursor: 'pointer' }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#2d2d2d', marginBottom: '4px' }}>Create an Image</p>
                  <p style={{ fontSize: '0.85rem', color: '#888' }}>Generate AI artwork instantly</p>
                </div>
              </div>
            </div>
          ) : (
            /* ACTIVE CHAT FEED */
            <div style={{ width: '100%', maxWidth: '768px' }}>
              {messages.map((msg, index) => (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start', marginBottom: '28px', width: '100%' }}>
                  
                  {msg.sender === 'ai' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 7.1"/><path d="m12 12 9.9 4.9"/></svg>
                      </div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0d0d0d' }}>My AI Agent</span>
                    </div>
                  )}

                  <div style={{ maxWidth: msg.sender === 'user' ? '75%' : '100%', backgroundColor: msg.sender === 'user' ? '#f4f4f4' : 'transparent', padding: msg.sender === 'user' ? '12px 20px' : '0', borderRadius: msg.sender === 'user' ? '24px' : '0', color: '#0d0d0d' }}>
                    
                    {msg.sender === 'ai' && msg.text === '' && loading ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', fontStyle: 'italic' }}>
                        <div style={{ width: '8px', height: '8px', backgroundColor: '#888', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
                        Thinking...
                      </div>
                    ) : (
                      <div className="markdown-body">
                        {msg.text.includes('![IMAGE](') ? (
                          msg.text.split('![IMAGE](').map((part, partIndex) => {
                            if (partIndex === 0) return <span key={partIndex}>{part}</span>;
                            const url = part.split(')')[0];
                            const remainingText = part.substring(url.length + 1);
                            return (
                              <div key={partIndex} style={{ margin: '16px 0' }}>
                                <img src={url} alt="AI Generated" style={{ maxWidth: '100%', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                {remainingText && <span style={{ display: 'block', marginTop: '12px' }}>{remainingText}</span>}
                              </div>
                            );
                          })
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.text}
                          </ReactMarkdown>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* FLOATING INPUT BAR */}
        <div style={{ position: 'fixed', bottom: 0, left: window.innerWidth > 768 ? '280px' : '0', right: 0, padding: '0 16px 32px 16px', background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, #ffffff 40%)' }}>
          <div style={{ maxWidth: '768px', margin: '0 auto', display: 'flex', alignItems: 'flex-end', backgroundColor: '#fff', borderRadius: '24px', padding: '10px 14px', boxShadow: '0 0 20px rgba(0,0,0,0.08)', border: '1px solid #e5e5e5' }}>
            
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: '#666' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 5.66l-8.59 8.58a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            
            <textarea 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Message My AI Agent..." 
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '1rem', color: '#0d0d0d', padding: '10px 12px', resize: 'none', maxHeight: '120px', minHeight: '44px', fontFamily: 'inherit' }}
              rows={1}
            />

            <button onClick={sendMessage} disabled={!input.trim() || loading} style={{ backgroundColor: input.trim() ? '#000' : '#e5e5e5', color: '#fff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', transition: 'background 0.2s', padding: '6px', marginBottom: '4px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#888', marginTop: '12px' }}>
            My AI Agent can make mistakes. Consider verifying important information.
          </div>
        </div>
      </main>
    </div>
  );
}