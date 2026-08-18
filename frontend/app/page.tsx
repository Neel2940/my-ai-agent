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

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Navigation & UI State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'images' | 'plugins' | 'projects' | 'library' | 'pricing' | 'settings'>('chat');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Swipe Gesture State
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

  return (
    <div className="coral-root" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap');
        @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');

        :root {
          --gesso-canvas: #2C2EB8;
          --gesso-surface: #5a5bcd;
          --gesso-surface-elevated: #6465d0;
          --gesso-surface-recessed: #2a2caf;
          --gesso-fg: #FFFFFF;
          --gesso-fg-muted: #B8B9E8;
          --gesso-divider: rgba(255,255,255,0.04);
          --gesso-accent: #FFFFFF;
          --gesso-accent-2: #F2A81E;
          --gesso-on-accent: #000000;
          --gesso-data-4: #7992ff;
          
          --gesso-radius-sm: 4px;
          --gesso-radius-md: 8px;
          --gesso-radius-lg: 12px;
          --gesso-radius-full: 9999px;
          
          --gesso-font-display: "Geist", system-ui, -apple-system, sans-serif;
          --gesso-font-body: "Satoshi", system-ui, -apple-system, sans-serif;
          
          --gesso-duration-fast: 180ms;
          --gesso-easing-default: cubic-bezier(.4,0,.2,1);
        }

        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; margin: 0; padding: 0; }
        
        .coral-root {
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

        h1, h2, h3, .display { font-family: var(--gesso-font-display); }
        button, input, textarea { font-family: inherit; color: inherit; }

        /* HEADER */
        .appbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 16px; flex-shrink: 0; z-index: 10;
        }
        .menu-btn {
          width: 40px; height: 40px; border-radius: var(--gesso-radius-full);
          background: transparent; border: none; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background var(--gesso-duration-fast) var(--gesso-easing-default);
        }
        .menu-btn:hover { background: rgba(255,255,255,0.06); }
        .menu-btn:active { transform: scale(0.94); }
        
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand-mark {
          width: 36px; height: 36px; border-radius: var(--gesso-radius-lg);
          background: linear-gradient(135deg, var(--gesso-accent-2) 0%, var(--gesso-data-4) 55%, var(--gesso-accent) 100%);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--gesso-font-display); font-weight: 700; font-size: 15px; color: var(--gesso-on-accent);
          position: relative; overflow: hidden;
        }
        .brand-mark::after {
          content: ""; position: absolute; inset: 0; padding: 0.5px; border-radius: inherit; pointer-events: none;
          background: conic-gradient(from 135deg, rgba(255,255,255,0.20), rgba(255,255,255,0.04) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.12));
          -webkit-mask: linear-gradient(#000,#000) content-box, linear-gradient(#000,#000);
          -webkit-mask-composite: xor; mask-composite: exclude;
        }
        .brand-name { font-family: var(--gesso-font-display); font-weight: 600; font-size: 17px; }
        
        .new-chat-btn {
          width: 40px; height: 40px; border-radius: var(--gesso-radius-full);
          background: rgba(255,255,255,0.06); border: none;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: background var(--gesso-duration-fast) var(--gesso-easing-default);
        }
        .new-chat-btn:hover { background: rgba(255,255,255,0.10); }

        /* SIGNATURE MOMENT */
        .moment {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 32px 16px 24px; flex: 1;
        }
        .mark-orbit { position: relative; width: 96px; height: 96px; display: flex; align-items: center; justify-content: center; }
        .mark-orbit svg { position: absolute; inset: 0; }
        .mark-core {
          width: 56px; height: 56px; border-radius: var(--gesso-radius-full);
          background: linear-gradient(135deg, var(--gesso-accent-2) 0%, var(--gesso-data-4) 50%, var(--gesso-accent) 100%);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--gesso-font-display); font-weight: 700; font-size: 16px; color: var(--gesso-on-accent);
          position: relative; z-index: 1;
          animation: gesso-mark-breathe 3.2s ease-in-out infinite;
        }
        @keyframes gesso-mark-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes gesso-arc-lead { from { transform: rotate(0deg); } to { transform: rotate(324deg); } }
        .arc-dot-g { animation: gesso-arc-lead 2.4s linear infinite; transform-origin: 48px 48px; }
        .stream-caption { font-size: 12px; letter-spacing: 0.04em; color: var(--gesso-fg-muted); }
        @keyframes gesso-caption-fade { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        .stream-caption .fading { animation: gesso-caption-fade 1.8s ease-in-out infinite; }

        /* THREAD */
        .main-col { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; }
        .thread {
          display: flex; flex-direction: column; gap: 20px; flex: 1;
          overflow-y: auto; padding: 0 16px 140px 16px;
        }
        .msg-row { display: flex; gap: 12px; max-width: 800px; width: 100%; margin: 0 auto; }
        .msg-row.user { justify-content: flex-end; }
        .avatar-ai {
          width: 32px; height: 32px; border-radius: var(--gesso-radius-full); flex-shrink: 0;
          background: linear-gradient(135deg, var(--gesso-accent-2), var(--gesso-data-4));
          display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--gesso-on-accent);
          font-family: var(--gesso-font-display);
        }
        .bubble {
          max-width: 85%; padding: 12px 16px; border-radius: var(--gesso-radius-lg);
          font-size: 15px; line-height: 1.6;
        }
        .bubble.ai { background: var(--gesso-surface); color: var(--gesso-fg); border-top-left-radius: 4px; }
        .bubble.user { background: var(--gesso-accent-2); color: var(--gesso-on-accent); border-top-right-radius: 4px; }
        
        .markdown-body p { margin-bottom: 0.8rem; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.95rem; }
        .markdown-body th, .markdown-body td { border: 1px solid rgba(255,255,255,0.1); padding: 8px 12px; text-align: left; }
        .markdown-body th { background-color: rgba(255,255,255,0.05); font-weight: 600; }
        .markdown-body img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: var(--gesso-radius-md); margin-top: 12px; outline: 1px solid rgba(255,255,255,0.05); outline-offset: -1px; }

        /* COMPOSER */
        .composer-wrap {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 200;
          padding: 12px 16px 24px;
          background: color-mix(in srgb, var(--gesso-canvas) 90%, transparent);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
        }
        .composer-inner { max-width: 800px; margin: 0 auto; }
        .attach-row { display: flex; gap: 8px; margin-bottom: 8px; overflow-x: auto; scrollbar-width: none; }
        .attach-row::-webkit-scrollbar { display: none; }
        .attach-chip {
          flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.06); color: var(--gesso-fg);
          border-radius: var(--gesso-radius-full); padding: 8px 12px; font-size: 12px; white-space: nowrap;
        }
        .composer {
          display: flex; align-items: center; gap: 8px;
          background: var(--gesso-surface-recessed); border-radius: var(--gesso-radius-full);
          padding: 8px 8px 8px 16px;
        }
        .composer-icon-btn {
          width: 36px; height: 36px; flex-shrink: 0; border-radius: var(--gesso-radius-full);
          background: transparent; border: none; color: var(--gesso-fg-muted);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: background var(--gesso-duration-fast), color var(--gesso-duration-fast);
        }
        .composer-icon-btn:hover { background: rgba(255,255,255,0.06); color: var(--gesso-fg); }
        .composer input {
          flex: 1; background: transparent; border: none; outline: none;
          font-family: var(--gesso-font-body); font-size: 15px; color: var(--gesso-fg); min-width: 0;
        }
        .composer input::placeholder { color: var(--gesso-fg-muted); }
        .send-btn {
          width: 40px; height: 40px; flex-shrink: 0; border-radius: var(--gesso-radius-full);
          background: var(--gesso-accent); color: var(--gesso-on-accent); border: none;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: filter var(--gesso-duration-fast);
        }
        .send-btn:hover { filter: brightness(0.92); }

        /* DRAWER */
        .drawer-overlay {
          position: fixed; inset: 0; z-index: 190; background: rgba(10,10,60,0.5);
          opacity: 0; pointer-events: none; transition: opacity var(--gesso-duration-fast) var(--gesso-easing-default);
        }
        .drawer-overlay.open { opacity: 1; pointer-events: auto; }
        .drawer {
          position: fixed; top: 0; bottom: 0; left: 0; width: 300px; z-index: 195;
          background: var(--gesso-surface-recessed); padding: 48px 16px 24px;
          display: flex; flex-direction: column; gap: 24px;
          transform: translateX(-100%); transition: transform 220ms var(--gesso-easing-default);
        }
        @media (min-width: 1024px) {
          .drawer { position: relative; transform: translateX(0); width: 300px; flex-shrink: 0; }
          .drawer-overlay { display: none !important; }
        }
        .drawer.open { transform: translateX(0); }
        
        .drawer-header { display: flex; align-items: center; gap: 12px; }
        .drawer-nav { display: flex; flex-direction: column; gap: 4px; }
        .drawer-item {
          display: flex; align-items: center; gap: 16px; padding: 12px 12px; border-radius: var(--gesso-radius-md);
          background: transparent; border: none; color: var(--gesso-fg); font-size: 15px; font-family: var(--gesso-font-body);
          cursor: pointer; text-align: left; width: 100%; transition: background var(--gesso-duration-fast);
        }
        .drawer-item:hover { background: rgba(255,255,255,0.06); }
        .drawer-item[aria-current="true"] { background: rgba(255,255,255,0.10); }
        
        .drawer-section-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gesso-fg-muted); padding: 8px 12px 0; }
        .drawer-recent { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
        .drawer-recent-item {
          padding: 12px 12px; border-radius: var(--gesso-radius-md); font-size: 14px; color: var(--gesso-fg-muted);
          cursor: pointer; transition: background var(--gesso-duration-fast), color var(--gesso-duration-fast);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; justify-content: space-between; align-items: center;
        }
        .drawer-recent-item:hover { background: rgba(255,255,255,0.05); color: var(--gesso-fg); }
        .drawer-recent-item button { background: none; border: none; color: inherit; padding: 4px; cursor: pointer; }

        .ic { display: inline-block; width: 16px; height: 16px; vertical-align: -0.125em; flex-shrink: 0; }
        .ic svg { width: 100%; height: 100%; display: block; }
      `}</style>

      {/* DRAWER & OVERLAY */}
      <div className={`drawer-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
      
      <nav className={`drawer ${sidebarOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="brand-mark">AI</div>
          <span className="brand-name">My AI</span>
        </div>
        
        <button className="drawer-item" onClick={createNewChat} aria-current={activeView === 'chat' && messages.length === 0}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 20, height: 20}}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-7-7v14"/></svg> 
          New chat
        </button>

        <div className="drawer-nav">
          <button className="drawer-item" aria-current={activeView === 'images'} onClick={() => { setActiveView('images'); closeSidebarOnMobile(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 20, height: 20}}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> 
            Images
          </button>
          <button className="drawer-item" aria-current={activeView === 'library'} onClick={() => { setActiveView('library'); closeSidebarOnMobile(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 20, height: 20}}><path strokeLinecap="round" strokeLinejoin="round" d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg> 
            Libraries
          </button>
          <button className="drawer-item" aria-current={activeView === 'projects'} onClick={() => { setActiveView('projects'); closeSidebarOnMobile(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 20, height: 20}}><g strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></g></svg> 
            Projects
          </button>
        </div>

        <span className="drawer-section-label">Recent</span>
        <div className="drawer-recent">
          {sessions.map((s) => (
            <div key={s.id} className="drawer-recent-item" onClick={() => { setCurrentSessionId(s.id); setActiveView('chat'); closeSidebarOnMobile(); }}>
              {s.title}
              <button onClick={(e) => deleteChat(s.id, e)}>✕</button>
            </div>
          ))}
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <div className="main-col">
        
        <div className="appbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 24, height: 24}}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 12h16M4 19h16"/></svg>
            </button>
            <div className="brand">
              <div className="brand-mark">AI</div>
              <span className="brand-name">My AI</span>
            </div>
          </div>
          
          <button className="new-chat-btn" onClick={createNewChat}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 20, height: 20}}><path strokeLinecap="round" strokeLinejoin="round" d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/></svg>
          </button>
        </div>

        {activeView === 'chat' ? (
          <div className="thread">
            {messages.length === 0 ? (
              <section className="moment">
                <div className="mark-orbit">
                  <svg viewBox="0 0 96 96" width="96" height="96">
                    <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/>
                    <g className="arc-dot-g"><circle cx="48" cy="6" r="3.5" fill="var(--gesso-accent-2)"/></g>
                  </svg>
                  <div className="mark-core">AI</div>
                </div>
                <div className="stream-caption">
                  <span className="fading">ready for anything...</span>
                </div>
              </section>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`msg-row ${msg.sender}`}>
                  {msg.sender === 'ai' && <div className="avatar-ai">AI</div>}
                  <div className={`bubble ${msg.sender} markdown-body`}>
                    {msg.sender === 'ai' && msg.text === '' && loading ? (
                      <span style={{ opacity: 0.7, fontStyle: 'italic' }}>Thinking...</span>
                    ) : (
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
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
                <div className="attach-row">
                  <span className="attach-chip">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 14, height: 14}}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg> 
                    {attachedFile}
                    <button onClick={() => setAttachedFile(null)} style={{ border: 'none', background: 'none', color: '#fff', marginLeft: '4px', cursor: 'pointer' }}>✕</button>
                  </span>
                </div>
              )}
              
              <div className="composer">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                
                <button className="composer-icon-btn" onClick={() => alert("Plugins coming soon!")}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 20, height: 20}}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-7-7v14"/></svg>
                </button>
                <button className="composer-icon-btn" onClick={() => fileInputRef.current?.click()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ic" style={{width: 20, height: 20}}><path strokeLinecap="round" strokeLinejoin="round" d="m16 6l-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>
                </button>
                
                <input 
                  type="text" 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} 
                  placeholder="Message My AI…" 
                />
                
                <button className="send-btn" onClick={sendMessage} disabled={(!input.trim() && !attachedFile) || loading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ic" style={{width: 18, height: 18}}><path strokeLinecap="round" strokeLinejoin="round" d="m5 12l7-7l7 7m-7 7V5"/></svg>
                </button>
              </div>
              
            </div>
          </div>
        )}

      </div>
    </div>
  );
}