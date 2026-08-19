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

// ---------------------------------------------------------
// NEW CUSTOM LOGO: Exact match to your reference image!
// ---------------------------------------------------------
const AILogo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
    {/* Dot inside 'a' */}
    <circle cx="35" cy="45" r="8" />
    {/* Dot above 'i' */}
    <circle cx="75" cy="25" r="8" />
    {/* Continuous flowing line forming 'a' and 'i' */}
    <path d="M 55 55 L 25 75 C 10 85, 5 65, 5 45 C 5 15, 20 5, 40 5 C 60 5, 60 25, 60 45 L 60 70 C 60 90, 85 90, 85 70 L 85 50" />
  </svg>
);

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'images' | 'plugins' | 'projects' | 'library'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Update Tab Icon to the new logo
  useEffect(() => {
    document.title = "My AI";
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement || document.createElement('link');
    link.type = 'image/svg+xml';
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 100 100" fill="none" stroke="black" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><circle cx="35" cy="45" r="8" /><circle cx="75" cy="25" r="8" /><path d="M 55 55 L 25 75 C 10 85, 5 65, 5 45 C 5 15, 20 5, 40 5 C 60 5, 60 25, 60 45 L 60 70 C 60 90, 85 90, 85 70 L 85 50" /></svg>';
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
        } else createNewChat();
      } catch (e) { createNewChat(); }
    } else createNewChat();
    
    if (window.innerWidth >= 1024) setSidebarOpen(true);
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
    if (distance > 50 && window.innerWidth < 1024) setSidebarOpen(false); 
    if (distance < -50 && touchStart < 50 && window.innerWidth < 1024) setSidebarOpen(true); 
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file.name);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !attachedFile) || loading || !currentSessionId) return;
    setActiveView('chat');
    
    let userText = input;
    if (attachedFile) userText = `[Attached File: ${attachedFile}] ${userText}`;
    
    setInput('');
    setAttachedFile(null);

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

  const filteredSessions = sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="claude-root" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&display=swap');

        :root {
          /* CLAUDE MINIMAL THEME */
          --gesso-canvas: #FFFFFF;
          --gesso-surface: #FFFFFF;
          --gesso-surface-recessed: #F9F9F9;
          --gesso-fg: #1A1A1A;
          --gesso-fg-muted: #666666;
          --gesso-divider: #E5E5E5;
          --gesso-accent: #000000;
          --gesso-on-accent: #FFFFFF;
          
          --gesso-radius-sm: 8px;
          --gesso-radius-md: 12px;
          --gesso-radius-lg: 16px;
          --gesso-radius-full: 9999px;
          
          --gesso-font-body: "Geist", system-ui, -apple-system, sans-serif;
          --gesso-duration-fast: 160ms;
          --gesso-easing-default: cubic-bezier(.2,.8,.2,1);
        }

        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; margin: 0; padding: 0; }
        
        .claude-root {
          background: var(--gesso-canvas);
          color: var(--gesso-fg);
          font-family: var(--gesso-font-body);
          display: flex;
          height: 100dvh;
          width: 100vw;
          overflow: hidden;
          position: fixed;
          top: 0; left: 0;
        }

        button, input, textarea { font-family: inherit; color: inherit; background: none; border: none; }

        .ic { display: inline-block; width: 18px; height: 18px; flex-shrink: 0; stroke-width: 2; }
        .ic-sm { width: 20px; height: 20px; stroke-width: 2; }
        .ic svg { width: 100%; height: 100%; display: block; }

        /* HEADER */
        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; flex-shrink: 0; z-index: 10;
        }
        .menu-btn {
          width: 40px; height: 40px; border-radius: var(--gesso-radius-full);
          display: flex; align-items: center; justify-content: center;
          color: var(--gesso-fg-muted); cursor: pointer; transition: background var(--gesso-duration-fast);
        }
        .menu-btn:hover { background: #F3F3F3; color: var(--gesso-fg); }
        .menu-btn:active { transform: scale(0.94); }
        
        .app-lockup { display: flex; align-items: center; gap: 8px; }
        .app-logo {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          color: var(--gesso-accent);
        }
        .app-name { font-weight: 500; font-size: 16px; color: var(--gesso-fg); letter-spacing: -0.01em; }

        .new-chat-btn {
          width: 40px; height: 40px; border-radius: var(--gesso-radius-full);
          color: var(--gesso-fg-muted); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background var(--gesso-duration-fast);
        }
        .new-chat-btn:hover { background: #F3F3F3; color: var(--gesso-fg); }

        /* SIGNATURE MOMENT */
        .signature-moment {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; padding: 24px 0; flex: 1;
        }
        .moment-mark {
          color: var(--gesso-accent);
          transition: transform 0.3s ease;
        }
        .gesso-moment-pulse-answer { animation: gesso-pulse-answer 2.4s ease-in-out infinite; }
        @keyframes gesso-pulse-answer { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } }
        
        .moment-status { font-size: 14px; font-weight: 500; color: var(--gesso-fg-muted); }

        /* THREAD */
        .main-col { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; }
        .thread {
          display: flex; flex-direction: column; gap: 24px; flex: 1;
          overflow-y: auto; padding: 16px 16px 140px 16px;
        }
        .msg-row { display: flex; width: 100%; max-width: 760px; margin: 0 auto; gap: 16px; }
        .msg-row.user { justify-content: flex-end; }
        .msg-row.ai { justify-content: flex-start; }

        .avatar-ai {
          width: 28px; height: 28px; flex-shrink: 0; margin-top: 4px;
          color: var(--gesso-accent); display: flex; align-items: center; justify-content: center;
        }

        .bubble {
          font-size: 15px; line-height: 1.6; letter-spacing: -0.01em;
        }
        .bubble.user {
          background: #F4F4F4; color: #1A1A1A;
          padding: 12px 18px; border-radius: var(--gesso-radius-lg);
          max-width: 80%;
        }
        .bubble.ai {
          background: transparent; color: #1A1A1A;
          padding: 4px 0; max-width: 100%;
        }
        
        .markdown-body p { margin-bottom: 1rem; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.95rem; }
        .markdown-body th, .markdown-body td { border-bottom: 1px solid var(--gesso-divider); padding: 10px 12px; text-align: left; }
        .markdown-body th { color: var(--gesso-fg-muted); font-weight: 500; }
        .markdown-body img { width: 100%; max-width: 400px; border-radius: var(--gesso-radius-md); margin-top: 12px; border: 1px solid var(--gesso-divider); }

        /* COMPOSER */
        .composer-wrap {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 200;
          padding: 12px 16px 24px;
          background: linear-gradient(to top, #FFFFFF 70%, rgba(255,255,255,0));
        }
        .composer-inner { max-width: 760px; margin: 0 auto; }
        
        .attach-preview { display: flex; gap: 8px; padding-bottom: 12px; }
        .attach-preview .thumb {
          position: relative; padding: 8px 12px; background: #F4F4F4; border: 1px solid #E5E5E5;
          border-radius: var(--gesso-radius-md); font-size: 13px; font-weight: 500;
          display: flex; align-items: center; gap: 8px; color: var(--gesso-fg);
        }
        .attach-preview .thumb .remove {
          background: transparent; width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--gesso-fg-muted);
        }
        .attach-preview .thumb .remove:hover { color: var(--gesso-fg); }
        
        .composer {
          display: flex; align-items: flex-end; gap: 8px;
          background: #F4F4F4; border-radius: var(--gesso-radius-lg);
          padding: 8px 8px 8px 16px; border: 1px solid transparent;
          transition: border var(--gesso-duration-fast), background var(--gesso-duration-fast);
        }
        .composer:focus-within {
          background: #FFFFFF; border: 1px solid #D1D1D1; box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }

        .composer-icons { display: flex; gap: 4px; flex-shrink: 0; align-items: center; padding-bottom: 2px; }
        .icon-btn {
          width: 32px; height: 32px; border-radius: var(--gesso-radius-full);
          display: flex; align-items: center; justify-content: center; color: var(--gesso-fg-muted);
          transition: background var(--gesso-duration-fast), color var(--gesso-duration-fast); cursor: pointer;
        }
        .icon-btn:hover { background: #E5E5E5; color: var(--gesso-fg); }
        
        .composer-input {
          flex: 1; min-width: 0; font-family: var(--gesso-font-body); font-size: 15px; color: var(--gesso-fg);
          background: transparent; border: none; outline: none; padding: 10px 4px; line-height: 1.4; align-self: center;
        }
        .composer-input::placeholder { color: var(--gesso-fg-muted); }
        
        .send-btn {
          width: 36px; height: 36px; border-radius: var(--gesso-radius-full);
          background: var(--gesso-accent); color: var(--gesso-on-accent);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;
          transition: background var(--gesso-duration-fast); margin-bottom: 2px;
        }
        .send-btn:hover { background: #333333; }
        .send-btn:disabled { background: #E5E5E5; color: #999999; cursor: not-allowed; }

        /* DRAWER */
        .drawer-scrim {
          position: fixed; inset: 0; z-index: 190; background: rgba(0,0,0,0.2);
          opacity: 0; pointer-events: none; transition: opacity 220ms var(--gesso-easing-default);
        }
        .drawer-scrim.open { opacity: 1; pointer-events: auto; }
        
        .drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 200; width: 280px;
          background: var(--gesso-surface-recessed); border-right: 1px solid var(--gesso-divider);
          padding: 24px 16px; display: flex; flex-direction: column; gap: 20px;
          transform: translateX(-100%); transition: transform 260ms var(--gesso-easing-default);
        }
        @media (min-width: 1024px) {
          .drawer { position: relative; transform: translateX(0); flex-shrink: 0; }
          .drawer-scrim { display: none !important; }
        }
        .drawer.open { transform: translateX(0); }
        
        .drawer-new {
          display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: var(--gesso-radius-md);
          background: transparent; color: var(--gesso-fg); font-size: 14px; font-weight: 500; cursor: pointer;
          transition: background var(--gesso-duration-fast); width: 100%; text-align: left; border: 1px solid transparent;
        }
        .drawer-new:hover { background: #E5E5E5; }
        
        .drawer-search-wrap {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--gesso-radius-md);
          background: #FFFFFF; border: 1px solid var(--gesso-divider); color: var(--gesso-fg-muted); font-size: 14px;
        }
        .drawer-search-wrap input { flex: 1; background: transparent; outline: none; border: none; font-size: 14px; color: var(--gesso-fg); }
        
        .drawer-nav { display: flex; flex-direction: column; gap: 2px; }
        .drawer-item {
          display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--gesso-radius-md);
          color: var(--gesso-fg); font-size: 14px; cursor: pointer; text-align: left; width: 100%;
          transition: background var(--gesso-duration-fast);
        }
        .drawer-item:hover { background: #EBEBEB; }
        .drawer-item[aria-current="true"] { background: #E5E5E5; font-weight: 500; }
        .drawer-item .ic { color: var(--gesso-fg-muted); }

        .drawer-section-label { font-size: 12px; color: var(--gesso-fg-muted); font-weight: 500; padding: 16px 12px 4px; }
        
        .drawer-history { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; flex: 1; margin-right: -8px; padding-right: 8px; }
        .hist-pill {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--gesso-radius-md);
          background: transparent; font-size: 14px; color: var(--gesso-fg); cursor: pointer;
          transition: background var(--gesso-duration-fast); width: 100%; text-align: left;
        }
        .hist-pill:hover { background: #EBEBEB; }
        .hist-pill .title-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hist-pill button { opacity: 0; cursor: pointer; padding: 4px; color: var(--gesso-fg-muted); transition: opacity 0.2s; }
        .hist-pill:hover button { opacity: 1; }
        .hist-pill button:hover { color: #000; }
      `}</style>

      {/* DRAWER & OVERLAY */}
      <div className={`drawer-scrim ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
      
      <aside className={`drawer ${sidebarOpen ? 'open' : ''}`}>
        <button className="drawer-new" onClick={createNewChat}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="app-logo" style={{ width: 24, height: 24 }}><AILogo size={24} /></div>
            <span>New chat</span>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/></svg>
        </button>

        <div className="drawer-search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input type="text" placeholder="Search chats..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        <nav className="drawer-nav">
          <button className="drawer-item" aria-current={activeView === 'library'} onClick={() => { setActiveView('library'); closeSidebarOnMobile(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic"><path strokeLinecap="round" strokeLinejoin="round" d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg> 
            Library
          </button>
          <button className="drawer-item" aria-current={activeView === 'projects'} onClick={() => { setActiveView('projects'); closeSidebarOnMobile(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic"><g strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></g></svg> 
            Projects
          </button>
        </nav>

        <div className="drawer-section-label">Recent</div>
        <div className="drawer-history">
          {filteredSessions.map((s) => (
            <button key={s.id} className="hist-pill" onClick={() => { setCurrentSessionId(s.id); setActiveView('chat'); closeSidebarOnMobile(); }}>
              <span className="title-text">{s.title}</span>
              <span onClick={(e) => deleteChat(s.id, e as any)}>✕</span>
            </button>
          ))}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="main-col">
        
        <header className="topbar">
          <div className="app-lockup">
            <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic" style={{width: 20, height: 20}}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <div className="app-name">My AI</div>
          </div>
          
          <button className="new-chat-btn" onClick={createNewChat}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic ic-sm"><path strokeLinecap="round" strokeLinejoin="round" d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/></svg>
          </button>
        </header>

        {activeView === 'chat' ? (
          <main className="thread">
            {messages.length === 0 ? (
              <div className="signature-moment">
                <div className={`moment-mark ${loading ? 'gesso-moment-pulse-answer' : ''}`}>
                  <AILogo size={72} />
                </div>
                <div className="moment-status" style={{ opacity: loading ? 1 : 0, transition: 'opacity 0.3s' }}>
                  Thinking...
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`msg-row ${msg.sender}`}>
                  {msg.sender === 'ai' && (
                    <div className="avatar-ai"><AILogo size={28} /></div>
                  )}
                  <div className={`bubble ${msg.sender} markdown-body`}>
                    {msg.sender === 'ai' && msg.text === '' && loading ? (
                      <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Generating response...</span>
                    ) : (
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </main>
        ) : (
          <div className="thread" style={{ alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{activeView.charAt(0).toUpperCase() + activeView.slice(1)}</h2>
            <p>Coming soon...</p>
          </div>
        )}

        {/* COMPOSER */}
        {activeView === 'chat' && (
          <div className="composer-wrap">
            <div className="composer-inner">
              
              {attachedFile && (
                <div className="attach-preview">
                  <div className="thumb">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic" style={{width: 14, height: 14}}><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    {attachedFile}
                    <button className="remove" onClick={() => setAttachedFile(null)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic" style={{width: 12, height: 12, strokeWidth: 2.5}}><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
              )}
              
              <div className="composer">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                
                <div className="composer-icons">
                  <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic" style={{ width: 18, height: 18 }}><path strokeLinecap="round" strokeLinejoin="round" d="m16 6l-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>
                  </button>
                </div>
                
                <input 
                  className="composer-input"
                  type="text" 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} 
                  placeholder="How can I help you today?" 
                />
                
                <button className="send-btn" onClick={sendMessage} disabled={(!input.trim() && !attachedFile) || loading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic" style={{ width: 18, height: 18 }}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-7-7v14"/></svg>
                </button>
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', color: '#999', marginTop: '8px' }}>
                AI can make mistakes. Verify important info.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}