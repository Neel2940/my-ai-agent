'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

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

const AILogo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="instaGradient" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#f09433" />
        <stop offset="25%" stopColor="#e6683c" />
        <stop offset="50%" stopColor="#dc2743" />
        <stop offset="75%" stopColor="#cc2366" />
        <stop offset="100%" stopColor="#bc1888" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#instaGradient)" />
    <text x="12" y="16.5" fill="white" fontSize="11" fontWeight="800" fontFamily="sans-serif" textAnchor="middle" letterSpacing="0.5">AI</text>
  </svg>
);

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'images' | 'plugins' | 'projects' | 'library' | 'pricing' | 'settings'>('chat');
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  useEffect(() => {
    document.title = "My AI";
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement || document.createElement('link');
    link.type = 'image/svg+xml';
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="%23f09433"/><stop offset="50%" stop-color="%23dc2743"/><stop offset="100%" stop-color="%23bc1888"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(%23ig)"/><text x="12" y="16.5" fill="white" font-size="11" font-weight="bold" font-family="sans-serif" text-anchor="middle">AI</text></svg>';
    document.getElementsByTagName('head')[0].appendChild(link);
  }, []);

  useEffect(() => {
    // Check local storage safely
    const savedSessions = localStorage.getItem('my_ai_agent_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
        } else createNewChat();
      } catch (e) { createNewChat(); }
    } else createNewChat();
    
    const savedUser = localStorage.getItem('my_ai_agent_user');
    if (savedUser) setUserEmail(savedUser);
    
    // Open sidebar by default on large screens
    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (sessions.length > 0) localStorage.setItem('my_ai_agent_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  useEffect(() => {
    if (activeView === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, activeView]);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > 50 && window.innerWidth < 768) setSidebarOpen(false); // Swipe left closes
    if (distance < -50 && touchStart < 50 && window.innerWidth < 768) setSidebarOpen(true); // Swipe right from edge opens
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const createNewChat = () => {
    const newSession: ChatSession = { id: Date.now().toString(), title: 'New chat', messages: [], createdAt: Date.now() };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setActiveView('chat');
    closeSidebarOnMobile();
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    if (updated.length > 0) {
      if (currentSessionId === id) setCurrentSessionId(updated[0].id);
    } else createNewChat();
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) return;
    localStorage.setItem('my_ai_agent_user', userEmail);
    setShowAuthModal(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !currentSessionId) return;
    setActiveView('chat');
    const userText = input;
    setInput('');

    const updatedMessages: Message[] = [...messages, { sender: 'user', text: userText }];
    let updatedTitle = currentSession?.title || 'New chat';
    if (messages.length === 0) updatedTitle = userText.length > 24 ? userText.substring(0, 24) + '...' : userText;

    setSessions((prev) => prev.map((s) => (s.id === currentSessionId ? { ...s, title: updatedTitle, messages: updatedMessages } : s)));
    setLoading(true);

    try {
      setSessions((prev) => prev.map((s) => (s.id === currentSessionId ? { ...s, messages: [...updatedMessages, { sender: 'ai', text: '' }] } : s)));
      const formattedHistory = updatedMessages.map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
      
      const res = await fetch('https://my-ai-agent-8ckl.onrender.com/smart_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: formattedHistory }),
      });
      if (!res.ok) throw new Error(`Server Error`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedText += decoder.decode(value, { stream: true });
          setSessions((prev) => prev.map((s) => {
            if (s.id !== currentSessionId) return s;
            const updated = [...s.messages];
            if (updated[updated.length - 1] && updated[updated.length - 1].sender === 'ai') {
              updated[updated.length - 1] = { ...updated[updated.length - 1], text: accumulatedText };
            }
            return { ...s, messages: updated };
          }));
        }
      }
    } catch (error: any) {
      setSessions((prev) => prev.map((s) => {
        if (s.id !== currentSessionId) return s;
        const updated = [...s.messages];
        updated[updated.length - 1] = { sender: 'ai', text: `⚠️ ERROR: ${error.message}` };
        return { ...s, messages: updated };
      }));
    } finally { setLoading(false); }
  };

  const handleNavClick = (view: any) => {
    setActiveView(view);
    closeSidebarOnMobile();
  };

  const filteredSessions = sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="app-container" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fff; color: #0d0d0d; }
        
        .app-container { display: flex; height: 100vh; width: 100vw; overflow: hidden; position: relative; }
        
        /* SIDEBAR CSS */
        .sidebar {
          height: 100%;
          background-color: #f9f9f9;
          border-right: 1px solid #e5e5e5;
          display: flex;
          flex-direction: column;
          z-index: 40;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), margin 0.3s ease;
          width: 280px;
          flex-shrink: 0;
        }
        
        /* MAIN CHAT AREA CSS */
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0; /* Prevents flexbox squishing */
        }
        
        /* BACKDROP FOR MOBILE */
        .backdrop {
          position: fixed; inset: 0; background-color: rgba(0,0,0,0.4);
          z-index: 30; opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
        }
        .backdrop.open { opacity: 1; pointer-events: auto; }

        /* RESPONSIVE DESIGN (The Magic Fix) */
        @media (max-width: 767px) {
          .sidebar {
            position: fixed; top: 0; bottom: 0; left: 0;
            width: 80%; max-width: 320px;
            transform: translateX(-100%);
          }
          .sidebar.open { transform: translateX(0); }
        }
        
        @media (min-width: 768px) {
          .sidebar {
            position: relative;
            margin-left: -280px;
          }
          .sidebar.open { margin-left: 0; }
          .backdrop { display: none !important; }
        }

        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 8px; color: #0d0d0d; text-decoration: none; font-size: 0.95rem; cursor: pointer; transition: background 0.15s; }
        .sidebar-item:hover { background-color: #e5e5e5; }
        .active-sidebar-item { background-color: #e5e5e5; font-weight: 600; }
        
        .chat-scroll-area { flex: 1; overflow-y: auto; padding: 20px 16px; display: flex; flexDirection: column; alignItems: center; }
        .input-area { flex-shrink: 0; padding: 12px 16px 24px 16px; background: linear-gradient(180deg, rgba(255,255,255,0) 0%, #ffffff 20%); }
        
        .markdown-body { line-height: 1.6; font-size: 1rem; color: #0d0d0d; }
        .markdown-body p { margin-bottom: 0.8rem; }
        .markdown-body table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.95rem; }
        .markdown-body th, .markdown-body td { border: 1px solid #e5e5e5; padding: 8px 12px; text-align: left; }
        .markdown-body th { background-color: #f7f7f7; font-weight: 600; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
      `}</style>

      {/* MOBILE BACKDROP */}
      <div className={`backdrop ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* SIDEBAR */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px 20px 8px' }}>
            <AILogo size={24} />
            <span style={{ fontWeight: 600, fontSize: '1.2rem', color: '#0d0d0d' }}>My AI</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
            <div className={`sidebar-item ${activeView === 'chat' && messages.length === 0 ? 'active-sidebar-item' : ''}`} onClick={createNewChat}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>New chat</span>
            </div>
            <div className="sidebar-item" onClick={() => setShowSearchModal(!showSearchModal)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Search chats</span>
            </div>
            <div className={`sidebar-item ${activeView === 'images' ? 'active-sidebar-item' : ''}`} onClick={() => handleNavClick('images')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>Images</span>
            </div>
            <div className={`sidebar-item ${activeView === 'plugins' ? 'active-sidebar-item' : ''}`} onClick={() => handleNavClick('plugins')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 7.1"/></svg>
              <span>Plugins</span>
            </div>
            <div className={`sidebar-item ${activeView === 'projects' ? 'active-sidebar-item' : ''}`} onClick={() => handleNavClick('projects')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>Projects</span>
            </div>
            <div className={`sidebar-item ${activeView === 'library' ? 'active-sidebar-item' : ''}`} onClick={() => handleNavClick('library')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <span>Library</span>
            </div>
          </div>

          {showSearchModal && (
            <div style={{ marginBottom: '12px' }}>
              <input type="text" placeholder="Search history..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d1d1', fontSize: '0.85rem', outline: 'none' }} />
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #ececec', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 600, paddingLeft: '8px', marginBottom: '6px' }}>Chats</div>
            {filteredSessions.map((s) => (
              <div key={s.id} onClick={() => { setCurrentSessionId(s.id); handleNavClick('chat'); }} className={`sidebar-item ${s.id === currentSessionId && activeView === 'chat' ? 'active-sidebar-item' : ''}`} style={{ justifyContent: 'space-between' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                <button onClick={(e) => deleteChat(s.id, e)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        
        {/* HEADER */}
        <header style={{ height: '56px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fff', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <span style={{ fontWeight: 600, fontSize: '1.1rem', color: '#0d0d0d' }}>My AI</span>
          </div>
          <div>
            {userEmail ? (
              <button onClick={() => { setUserEmail(null); localStorage.removeItem('my_ai_agent_user'); }} style={{ padding: '6px 12px', borderRadius: '18px', border: '1px solid #d1d1d1', backgroundColor: '#fff', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>Log out</button>
            ) : (
              <button onClick={() => setShowAuthModal(true)} style={{ padding: '6px 14px', borderRadius: '18px', border: 'none', backgroundColor: '#0d0d0d', color: '#fff', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>Log in</button>
            )}
          </div>
        </header>

        {/* CHAT SCROLL AREA */}
        <div className="chat-scroll-area">
          {activeView === 'chat' && messages.length === 0 ? (
            <div style={{ width: '100%', maxWidth: '680px', margin: 'auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ marginBottom: '24px' }}><AILogo size={64} /></div>
              <h2 style={{ fontSize: '2rem', fontWeight: 600, color: '#0d0d0d', marginBottom: '32px' }}>Where should we begin?</h2>
            </div>
          ) : activeView === 'chat' ? (
            <div style={{ width: '100%', maxWidth: '720px' }}>
              {messages.map((msg, index) => (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start', marginBottom: '24px', width: '100%' }}>
                  {msg.sender === 'ai' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <AILogo size={20} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0d0d0d' }}>My AI</span>
                    </div>
                  )}
                  <div style={{ maxWidth: msg.sender === 'user' ? '90%' : '100%', backgroundColor: msg.sender === 'user' ? '#f4f4f4' : 'transparent', padding: msg.sender === 'user' ? '12px 18px' : '0', borderRadius: msg.sender === 'user' ? '20px' : '0' }}>
                    {msg.sender === 'ai' && msg.text === '' && loading ? (
                      <div style={{ color: '#888', fontStyle: 'italic', fontSize: '0.95rem' }}>Thinking...</div>
                    ) : (
                      <div className="markdown-body"><ReactMarkdown>{msg.text}</ReactMarkdown></div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: '720px', textAlign: 'center', color: '#666' }}>
              <h2 style={{ fontSize: '1.5rem', color: '#0d0d0d', marginTop: '40px' }}>{activeView.charAt(0).toUpperCase() + activeView.slice(1)}</h2>
              <p>This page is under construction.</p>
            </div>
          )}
        </div>

        {/* INPUT AREA (Locked to bottom, ignores sidebar width issues) */}
        {activeView === 'chat' && (
          <div className="input-area">
            <div style={{ maxWidth: '720px', margin: '0 auto', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '24px', padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button style={{ background: '#f4f4f4', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Message My AI..." style={{ flex: 1, border: 'none', outline: 'none', fontSize: '1rem', padding: '6px', resize: 'none', maxHeight: '100px', minHeight: '32px', fontFamily: 'inherit' }} rows={1} />
              <button onClick={sendMessage} disabled={!input.trim() || loading} style={{ backgroundColor: input.trim() ? '#0d0d0d' : '#e0e0e0', color: '#fff', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* AUTH MODAL */}
      {showAuthModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '380px', position: 'relative' }}>
            <button onClick={() => setShowAuthModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>✕</button>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#0d0d0d', marginBottom: '8px', textAlign: 'center' }}>{authMode === 'login' ? 'Welcome back' : 'Create an account'}</h3>
            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
              <input type="email" required onChange={(e) => setUserEmail(e.target.value)} placeholder="Email address" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.95rem', outline: 'none' }} />
              <input type="password" required placeholder="Password" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.95rem', outline: 'none' }} />
              <button type="submit" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#0d0d0d', color: '#fff', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}>Continue</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}