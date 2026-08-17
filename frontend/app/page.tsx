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

// 1. CUSTOM INSTAGRAM-STYLE LOGO COMPONENT
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  
  // App Navigation State
  const [activeView, setActiveView] = useState<'chat' | 'images' | 'plugins' | 'projects' | 'library' | 'pricing' | 'settings'>('chat');

  // Auth State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 2. INJECT FAVICON AND TAB TITLE
  useEffect(() => {
    document.title = "My AI";
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement || document.createElement('link');
    link.type = 'image/svg+xml';
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="%23f09433"/><stop offset="50%" stop-color="%23dc2743"/><stop offset="100%" stop-color="%23bc1888"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(%23ig)"/><text x="12" y="16.5" fill="white" font-size="11" font-weight="bold" font-family="sans-serif" text-anchor="middle">AI</text></svg>';
    document.getElementsByTagName('head')[0].appendChild(link);
  }, []);

  useEffect(() => {
    const savedSessions = localStorage.getItem('my_ai_agent_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
        } else {
          createNewChat();
        }
      } catch (e) {
        createNewChat();
      }
    } else {
      createNewChat();
    }
    const savedUser = localStorage.getItem('my_ai_agent_user');
    if (savedUser) setUserEmail(savedUser);
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('my_ai_agent_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  useEffect(() => {
    if (activeView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, activeView]);

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setActiveView('chat');
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

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setUserEmail(emailInput);
    localStorage.setItem('my_ai_agent_user', emailInput);
    setShowAuthModal(false);
    setEmailInput('');
    setPasswordInput('');
  };

  const handleLogout = () => {
    setUserEmail(null);
    localStorage.removeItem('my_ai_agent_user');
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !currentSessionId) return;
    setActiveView('chat'); // Ensure we are in chat view
    const userText = input;
    setInput('');

    const updatedMessages: Message[] = [...messages, { sender: 'user', text: userText }];
    let updatedTitle = currentSession?.title || 'New chat';
    if (messages.length === 0) {
      updatedTitle = userText.length > 24 ? userText.substring(0, 24) + '...' : userText;
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

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#ffffff', color: '#0d0d0d', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: #0d0d0d; text-decoration: none; font-size: 0.92rem; cursor: pointer; transition: background 0.15s; }
        .sidebar-item:hover { background-color: #f3f3f3; }
        .active-sidebar-item { background-color: #e8e8e8; font-weight: 600; }
        .markdown-body { line-height: 1.6; font-size: 1rem; color: #0d0d0d; }
        .markdown-body p { margin-bottom: 0.8rem; }
        .markdown-body table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.95rem; }
        .markdown-body th, .markdown-body td { border: 1px solid #e5e5e5; padding: 8px 12px; text-align: left; }
        .markdown-body th { background-color: #f7f7f7; font-weight: 600; }
        .markdown-body pre { background: #f4f4f4; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 10px 0; font-family: monospace; }
        .page-header { font-size: 2rem; font-weight: 600; margin-bottom: 8px; }
        .page-subtitle { color: #666; font-size: 1rem; margin-bottom: 32px; }
        
        @media (max-width: 768px) {
          .mobile-hide { display: none !important; }
        }
      `}</style>

      {/* SIDEBAR */}
      <aside style={{ width: sidebarOpen ? '260px' : '0px', transition: 'width 0.2s ease', overflow: 'hidden', backgroundColor: '#f9f9f9', borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
        <div style={{ width: '260px', padding: '12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px 14px 8px' }}>
            <AILogo size={22} />
            <span style={{ fontWeight: 600, fontSize: '1.05rem', color: '#0d0d0d' }}>My AI</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '16px' }}>
            <div className={`sidebar-item ${activeView === 'chat' && messages.length === 0 ? 'active-sidebar-item' : ''}`} onClick={createNewChat}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>New chat</span>
            </div>

            <div className="sidebar-item" onClick={() => setShowSearchModal(!showSearchModal)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Search chats</span>
            </div>

            <div className={`sidebar-item ${activeView === 'images' ? 'active-sidebar-item' : ''}`} onClick={() => setActiveView('images')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>Images</span>
            </div>

            <div className={`sidebar-item ${activeView === 'plugins' ? 'active-sidebar-item' : ''}`} onClick={() => setActiveView('plugins')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12 2.1 7.1"/></svg>
              <span>Plugins</span>
            </div>

            <div className={`sidebar-item ${activeView === 'projects' ? 'active-sidebar-item' : ''}`} onClick={() => setActiveView('projects')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>Projects</span>
            </div>

            <div className={`sidebar-item ${activeView === 'library' ? 'active-sidebar-item' : ''}`} onClick={() => setActiveView('library')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <span>Library</span>
            </div>
          </div>

          {showSearchModal && (
            <div style={{ marginBottom: '12px' }}>
              <input type="text" placeholder="Search history..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d1d1', fontSize: '0.85rem', outline: 'none' }} />
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #ececec', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 600, paddingLeft: '8px', marginBottom: '6px' }}>Chats</div>
            {filteredSessions.map((s) => (
              <div
                key={s.id}
                onClick={() => { setCurrentSessionId(s.id); setActiveView('chat'); }}
                className={`sidebar-item ${s.id === currentSessionId && activeView === 'chat' ? 'active-sidebar-item' : ''}`}
                style={{ justifyContent: 'space-between' }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                <button onClick={(e) => deleteChat(s.id, e)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #ececec', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div className={`sidebar-item ${activeView === 'pricing' ? 'active-sidebar-item' : ''}`} onClick={() => setActiveView('pricing')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              <span>See plans and pricing</span>
            </div>

            <div className={`sidebar-item ${activeView === 'settings' ? 'active-sidebar-item' : ''}`} onClick={() => setActiveView('settings')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Settings</span>
            </div>

            <div className="sidebar-item" onClick={() => alert("Help Center coming soon!")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Help</span>
            </div>

            <div style={{ marginTop: '8px', padding: '8px 12px', fontSize: '0.78rem', color: '#666', lineHeight: '1.4' }}>
              <strong>Get responses tailored to you</strong>
              <div style={{ fontSize: '0.73rem', color: '#888', marginTop: '2px' }}>
                Log in to get answers based on saved chats, plus create images and upload files.
              </div>
            </div>
          </div>

        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflowY: 'auto' }}>
        
        <header style={{ height: '56px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer', borderRadius: '6px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </button>
            <span style={{ fontWeight: 600, fontSize: '1rem', color: '#0d0d0d', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AILogo size={20} /> My AI
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {userEmail ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.88rem', color: '#555', fontWeight: 500 }}>{userEmail}</span>
                <button onClick={handleLogout} style={{ padding: '6px 12px', borderRadius: '18px', border: '1px solid #d1d1d1', backgroundColor: '#fff', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>Log out</button>
              </div>
            ) : (
              <>
                <button onClick={() => { setAuthMode('login'); setShowAuthModal(true); }} style={{ padding: '6px 14px', borderRadius: '18px', border: 'none', backgroundColor: '#0d0d0d', color: '#fff', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>Log in</button>
                <button onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }} style={{ padding: '6px 14px', borderRadius: '18px', border: '1px solid #d1d1d1', backgroundColor: '#fff', color: '#0d0d0d', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>Sign up</button>
              </>
            )}
          </div>
        </header>

        {/* -------------------- DYNAMIC VIEWS -------------------- */}
        
        {/* VIEW: CHAT */}
        {activeView === 'chat' && (
          <div style={{ flex: 1, padding: '20px 16px 160px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {messages.length === 0 ? (
              <div style={{ width: '100%', maxWidth: '680px', margin: 'auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ marginBottom: '24px' }}><AILogo size={64} /></div>
                <h2 style={{ fontSize: '2.2rem', fontWeight: 600, color: '#0d0d0d', marginBottom: '32px', letterSpacing: '-0.5px' }}>
                  Where should we begin?
                </h2>
                <div style={{ width: '100%', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '24px', padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                  <button onClick={() => fileInputRef.current?.click()} style={{ background: '#f4f4f4', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#444' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ask anything" style={{ flex: 1, border: 'none', outline: 'none', fontSize: '1.02rem', padding: '6px 8px', resize: 'none', height: '36px', fontFamily: 'inherit' }} rows={1} />
                  <button onClick={sendMessage} disabled={!input.trim() || loading} style={{ backgroundColor: input.trim() ? '#0d0d0d' : '#e0e0e0', color: '#fff', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                  </button>
                </div>
                <div style={{ marginTop: '20px' }}>
                  <button onClick={() => setInput('What can you do?')} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #e5e5e5', backgroundColor: '#fff', fontSize: '0.88rem', color: '#555', cursor: 'pointer' }}>What can you do?</button>
                </div>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: '720px' }}>
                {messages.map((msg, index) => (
                  <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start', marginBottom: '24px', width: '100%' }}>
                    {msg.sender === 'ai' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <AILogo size={20} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0d0d0d' }}>My AI</span>
                      </div>
                    )}
                    <div style={{ maxWidth: msg.sender === 'user' ? '80%' : '100%', backgroundColor: msg.sender === 'user' ? '#f4f4f4' : 'transparent', padding: msg.sender === 'user' ? '12px 18px' : '0', borderRadius: msg.sender === 'user' ? '20px' : '0' }}>
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
            )}
          </div>
        )}

        {/* VIEW: IMAGES */}
        {activeView === 'images' && (
          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', width: '100%' }}>
            <h1 className="page-header" style={{ textAlign: 'center' }}>Images</h1>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#f4f4f4', border: 'none', borderRadius: '24px', fontSize: '0.95rem', cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                Describe a new image
              </button>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '16px' }}>Create an image</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
              {['Create a caricature', 'Tiranga outfit', 'Anime', 'Underwater'].map((title, i) => (
                <div key={i} style={{ height: '200px', borderRadius: '16px', background: `linear-gradient(45deg, #f09433, #bc1888)`, display: 'flex', alignItems: 'flex-end', padding: '16px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                  {title}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: PLUGINS */}
        {activeView === 'plugins' && (
          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', width: '100%' }}>
            <h1 className="page-header">Plugins</h1>
            <p className="page-subtitle">Work with My AI across your favorite tools.</p>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#666', marginBottom: '16px', borderBottom: '1px solid #eaeaea', paddingBottom: '8px' }}>Featured</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {[
                { title: 'Gmail', desc: 'Read and manage Gmail' },
                { title: 'Google Drive', desc: 'Work across Drive, Docs, Sheets' },
                { title: 'Outlook Email', desc: 'Triage Microsoft Outlook inboxes' },
                { title: 'GitHub', desc: 'Triage PRs, issues, CI, and publish' },
                { title: 'SharePoint', desc: 'Summarize Microsoft SharePoint sites' },
                { title: 'Slack', desc: 'Read and manage Slack' },
              ].map((plugin, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid #eaeaea', borderRadius: '12px' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>{plugin.title}</strong>
                    <span style={{ color: '#888', fontSize: '0.85rem' }}>{plugin.desc}</span>
                  </div>
                  <button style={{ border: 'none', background: 'none', fontSize: '1.5rem', color: '#888', cursor: 'pointer' }}>+</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: PROJECTS */}
        {activeView === 'projects' && (
          <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h1 className="page-header" style={{ margin: 0 }}>Projects</h1>
              <input type="text" placeholder="Search projects..." style={{ padding: '8px 12px', borderRadius: '20px', border: '1px solid #eaeaea', backgroundColor: '#f9f9f9', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid #eaeaea', paddingBottom: '12px', marginBottom: '24px', fontSize: '0.9rem', color: '#666' }}>
              <span style={{ color: '#0d0d0d', fontWeight: 600, cursor: 'pointer' }}>All</span>
              <span style={{ cursor: 'pointer' }}>Created by you</span>
              <span style={{ cursor: 'pointer' }}>Shared with you</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', color: '#888', fontSize: '0.85rem', borderBottom: '1px solid #eaeaea' }}>
              <span>Name</span>
              <span>Modified</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 12px', borderBottom: '1px solid #f4f4f4', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 500 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Contact book project
              </span>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>Jun 7</span>
            </div>
          </div>
        )}

        {/* VIEW: LIBRARY */}
        {activeView === 'library' && (
          <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h1 className="page-header" style={{ margin: 0 }}>Library</h1>
              <input type="text" placeholder="Search library..." style={{ padding: '8px 12px', borderRadius: '20px', border: '1px solid #eaeaea', backgroundColor: '#f9f9f9', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid #eaeaea', paddingBottom: '12px', marginBottom: '24px', fontSize: '0.9rem', color: '#666' }}>
              <span style={{ color: '#0d0d0d', fontWeight: 600, cursor: 'pointer' }}>All</span>
              <span style={{ cursor: 'pointer' }}>Images</span>
              <span style={{ cursor: 'pointer' }}>Documents</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', padding: '12px', color: '#888', fontSize: '0.85rem', borderBottom: '1px solid #eaeaea' }}>
              <span>Name</span>
              <span>Modified</span>
              <span>Size</span>
            </div>
            {[
              { name: 'image-1785343682924.jpg', date: 'Jul 29', size: '312 KB' },
              { name: 'image-1785343609611.jpg', date: 'Jul 29', size: '243 KB' },
              { name: '3292.jpg', date: 'Jun 27', size: '40.0 KB' },
            ].map((file, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', padding: '16px 12px', borderBottom: '1px solid #f4f4f4', alignItems: 'center', fontSize: '0.9rem' }}>
                <span style={{ color: '#0d0d0d' }}>{file.name}</span>
                <span style={{ color: '#666' }}>{file.date}</span>
                <span style={{ color: '#666' }}>{file.size}</span>
              </div>
            ))}
          </div>
        )}

        {/* VIEW: PRICING */}
        {activeView === 'pricing' && (
          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '60px 20px', width: '100%', textAlign: 'center' }}>
            <h1 style={{ fontSize: '3rem', fontWeight: 600, marginBottom: '16px' }}>Pricing</h1>
            <p className="page-subtitle" style={{ fontSize: '1.1rem' }}>See pricing for our individual, business, and enterprise plans.</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', borderBottom: '1px solid #eaeaea', paddingBottom: '20px', marginBottom: '40px' }}>
              <span style={{ color: '#0d0d0d', fontWeight: 600, borderBottom: '2px solid #0d0d0d', paddingBottom: '8px', cursor: 'pointer' }}>Individual</span>
              <span style={{ color: '#888', cursor: 'pointer' }}>Business & Enterprise</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', textAlign: 'left' }}>
              <div style={{ padding: '24px', border: '1px solid #eaeaea', borderRadius: '16px' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Free</h2>
                <p style={{ color: '#666', fontSize: '0.9rem' }}>Intelligence for everyday tasks.</p>
              </div>
              <div style={{ padding: '24px', border: '1px solid #eaeaea', borderRadius: '16px' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Go</h2>
                <p style={{ color: '#666', fontSize: '0.9rem' }}>Expanded access for power users.</p>
              </div>
              <div style={{ padding: '24px', border: '1px solid #eaeaea', borderRadius: '16px', borderTop: '4px solid #bc1888' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Plus</h2>
                <p style={{ color: '#666', fontSize: '0.9rem' }}>Do more with our smartest model.</p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SETTINGS */}
        {activeView === 'settings' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px', width: '100%' }}>
            <h1 className="page-header" style={{ marginBottom: '24px' }}>Settings</h1>
            <div style={{ padding: '20px', border: '1px solid #eaeaea', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #eaeaea', marginBottom: '16px' }}>
                <span style={{ fontWeight: 500 }}>Theme</span>
                <span style={{ color: '#666' }}>System</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #eaeaea', marginBottom: '16px' }}>
                <span style={{ fontWeight: 500 }}>Clear all chats</span>
                <button onClick={() => setSessions([])} style={{ background: 'none', border: '1px solid #ff4444', color: '#ff4444', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer' }}>Clear</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500 }}>Export data</span>
                <span style={{ color: '#0d0d0d', cursor: 'pointer', textDecoration: 'underline' }}>Export</span>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM FIXED INPUT BAR (Only visible if inside an active chat) */}
        {activeView === 'chat' && messages.length > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: sidebarOpen ? '260px' : '0', right: 0, padding: '0 16px 24px 16px', background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, #ffffff 50%)' }}>
            <div style={{ maxWidth: '720px', margin: '0 auto', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '24px', padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => fileInputRef.current?.click()} style={{ background: '#f4f4f4', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#444' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Message My AI..." style={{ flex: 1, border: 'none', outline: 'none', fontSize: '1rem', padding: '6px', resize: 'none', maxHeight: '100px', minHeight: '32px', fontFamily: 'inherit' }} rows={1} />
              <button onClick={sendMessage} disabled={!input.trim() || loading} style={{ backgroundColor: input.trim() ? '#0d0d0d' : '#e0e0e0', color: '#fff', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: '0.73rem', color: '#888', marginTop: '8px' }}>
              My AI is generated. By using it, you agree to our Terms & Privacy Policy.
            </div>
          </div>
        )}

      </main>

      {/* LOGIN / SIGNUP MODAL */}
      {showAuthModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', position: 'relative' }}>
            <button onClick={() => setShowAuthModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#0d0d0d', marginBottom: '8px', textAlign: 'center' }}>
              {authMode === 'login' ? 'Welcome back' : 'Create an account'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '24px', textAlign: 'center' }}>Log in or sign up to save your chat history and preferences.</p>
            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#444', marginBottom: '4px' }}>Email address</label>
                <input type="email" required value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="name@example.com" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.95rem', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#444', marginBottom: '4px' }}>Password</label>
                <input type="password" required value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.95rem', outline: 'none' }} />
              </div>
              <button type="submit" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#0d0d0d', color: '#fff', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', marginTop: '8px' }}>
                {authMode === 'login' ? 'Continue' : 'Sign up'}
              </button>
            </form>
            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem', color: '#666' }}>
              {authMode === 'login' ? (
                <>Don't have an account? <span onClick={() => setAuthMode('signup')} style={{ color: '#0d0d0d', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Sign up</span></>
              ) : (
                <>Already have an account? <span onClick={() => setAuthMode('login')} style={{ color: '#0d0d0d', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Log in</span></>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 