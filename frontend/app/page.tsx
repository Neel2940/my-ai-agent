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
  const [activeView, setActiveView] = useState<'chat' | 'images' | 'plugins' | 'projects' | 'library'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Swipe Gesture State
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  useEffect(() => {
    document.title = "My AI - Aurora";
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement || document.createElement('link');
    link.type = 'image/svg+xml';
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="%23ffad61"/><text x="12" y="16.5" fill="black" font-size="11" font-weight="bold" font-family="sans-serif" text-anchor="middle">AI</text></svg>';
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
    <div className="aurora-root" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;600;700&display=swap');
        @import url('https://api.fontshare.com/v2/css?f[]=satoshi@300,400,600,700&display=swap');

        :root {
          --gesso-canvas: #FBF4EC;
          --gesso-surface: #FFFFFF;
          --gesso-surface-elevated: #f5f5f5;
          --gesso-surface-recessed: #f1eae3;
          --gesso-fg: #1A1A1A;
          --gesso-fg-muted: #7A7068;
          --gesso-divider: rgba(0, 0, 0, 0.04);
          --gesso-accent: #ffad61;
          --gesso-accent-2: #C95BE0;
          --gesso-on-accent: #000000;
          --gesso-success: #3FB8F0;
          
          --gesso-radius-sm: 8px;
          --gesso-radius-md: 16px;
          --gesso-radius-lg: 24px;
          --gesso-radius-full: 9999px;
          
          --gesso-shadow-sm: 0 1px 2px rgba(26,26,26,0.04);
          --gesso-shadow-md: 0 4px 10px rgba(26,26,26,0.06), 0 1px 3px rgba(26,26,26,0.05);
          --gesso-shadow-lg: 0 8px 24px rgba(26,26,26,0.07);
          
          --gesso-font-display: "Geist", system-ui, -apple-system, sans-serif;
          --gesso-font-body: "Satoshi", system-ui, -apple-system, sans-serif;
          
          --gesso-duration-fast: 160ms;
          --gesso-easing-default: cubic-bezier(.2,.8,.2,1);
        }

        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; margin: 0; padding: 0; }
        
        .aurora-root {
          background: radial-gradient(circle at 4px 4px, rgba(26,26,26,0.05) 1px, transparent 1.5px) 0 0/16px 16px, var(--gesso-canvas);
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
        button, input, textarea { font-family: inherit; color: inherit; background: none; border: none; }

        .ic { display: inline-block; width: 16px; height: 16px; vertical-align: -0.125em; flex-shrink: 0; stroke-width: 2; }
        .ic-sm { width: 20px; height: 20px; stroke-width: 2.25; }
        .ic svg { width: 100%; height: 100%; display: block; }

        /* HEADER */
        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 16px; flex-shrink: 0; z-index: 10;
        }
        .menu-btn {
          width: 40px; height: 40px; border-radius: var(--gesso-radius-full);
          display: flex; align-items: center; justify-content: center;
          color: var(--gesso-fg); cursor: pointer; transition: background var(--gesso-duration-fast) var(--gesso-easing-default);
        }
        .menu-btn:hover { background: rgba(26,26,26,0.05); }
        .menu-btn:active { transform: scale(0.94); }
        
        .app-lockup { display: flex; align-items: center; gap: 12px; }
        .app-logo {
          width: 36px; height: 36px; border-radius: var(--gesso-radius-full);
          background: conic-gradient(from 200deg, var(--gesso-accent), var(--gesso-accent-2), var(--gesso-success), var(--gesso-accent));
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .app-logo span { font-family: var(--gesso-font-display); font-weight: 700; font-size: 13px; color: #fff; letter-spacing: -0.02em; }
        .app-name { font-family: var(--gesso-font-display); font-weight: 600; font-size: 17px; color: var(--gesso-fg); }

        .new-chat-btn {
          width: 40px; height: 40px; border-radius: var(--gesso-radius-full);
          background: var(--gesso-surface); color: var(--gesso-fg); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background var(--gesso-duration-fast) var(--gesso-easing-default), transform 80ms var(--gesso-easing-default);
          box-shadow: var(--gesso-shadow-sm);
        }
        .new-chat-btn:hover { background: var(--gesso-surface-elevated); }
        .new-chat-btn:active { transform: scale(0.94); }

        /* SIGNATURE MOMENT */
        .signature-moment {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 8px; padding: 24px 0 4px; flex: 1;
        }
        .moment-mark {
          width: 64px; height: 64px; border-radius: var(--gesso-radius-full);
          background: conic-gradient(from 210deg, var(--gesso-accent), var(--gesso-accent-2), var(--gesso-success), var(--gesso-accent));
          display: flex; align-items: center; justify-content: center; position: relative;
        }
        .moment-mark::after {
          content: ""; position: absolute; inset: -8px; border-radius: inherit; border: 2px solid transparent;
          background: conic-gradient(from 210deg, var(--gesso-accent), var(--gesso-accent-2), var(--gesso-success), var(--gesso-accent)) border-box;
          -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; opacity: 0.5;
        }
        .gesso-moment-pulse-answer { animation: gesso-pulse-answer 2.4s ease-in-out infinite; }
        @keyframes gesso-pulse-answer { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        .moment-mark span { font-family: var(--gesso-font-display); font-weight: 700; font-size: 22px; color: #fff; }
        
        .moment-status { font-size: 13px; color: var(--gesso-fg-muted); letter-spacing: 0.02em; margin-top: 12px; }
        .moment-status .dots span { display: inline-block; animation: gesso-status-dots 1.4s ease-in-out infinite; }
        .moment-status .dots span:nth-child(2) { animation-delay: 0.15s; }
        .moment-status .dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes gesso-status-dots { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

        /* THREAD */
        .main-col { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; }
        .thread {
          display: flex; flex-direction: column; gap: 20px; flex: 1;
          overflow-y: auto; padding: 0 16px 140px 16px;
        }
        .msg-row { display: flex; width: 100%; max-width: 800px; margin: 0 auto; }
        .msg-row.user { justify-content: flex-end; }
        .msg-row.ai { justify-content: flex-start; }

        .bubble {
          max-width: 85%; padding: 16px 20px;
          font-size: 15px; line-height: 1.5;
        }
        .bubble.user {
          background: var(--gesso-accent); color: var(--gesso-on-accent);
          border-radius: var(--gesso-radius-lg) var(--gesso-radius-sm) var(--gesso-radius-lg) var(--gesso-radius-lg);
        }
        .bubble.ai {
          background: var(--gesso-surface); color: var(--gesso-fg);
          border-radius: var(--gesso-radius-sm) var(--gesso-radius-lg) var(--gesso-radius-lg) var(--gesso-radius-lg);
          box-shadow: var(--gesso-shadow-sm);
        }
        
        .markdown-body p { margin-bottom: 0.8rem; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.95rem; }
        .markdown-body th, .markdown-body td { border: 1px solid var(--gesso-divider); padding: 8px 12px; text-align: left; }
        .markdown-body th { background-color: var(--gesso-surface-elevated); font-weight: 600; }
        .markdown-body img { width: 100%; max-width: 400px; border-radius: var(--gesso-radius-md); margin-top: 12px; box-shadow: var(--gesso-shadow-sm); }

        /* COMPOSER */
        .composer-wrap {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 200;
          padding: 12px 16px 24px;
          background: color-mix(in srgb, var(--gesso-canvas) 90%, transparent);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          box-shadow: 0 -8px 24px -8px rgba(26,26,26,0.10);
        }
        .composer-inner { max-width: 800px; margin: 0 auto; }
        
        .attach-preview { display: flex; gap: 8px; padding-bottom: 8px; overflow-x: auto; }
        .attach-preview .thumb {
          position: relative; padding: 8px 12px; background: var(--gesso-surface-recessed);
          border-radius: var(--gesso-radius-sm); font-size: 13px; font-weight: 500;
          display: flex; align-items: center; gap: 8px; box-shadow: var(--gesso-shadow-sm);
        }
        .attach-preview .thumb .remove {
          background: rgba(26,26,26,0.1); border-radius: var(--gesso-radius-full); width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--gesso-fg);
        }
        
        .composer {
          display: flex; align-items: flex-end; gap: 8px;
          background: var(--gesso-surface); border-radius: var(--gesso-radius-lg);
          padding: 8px 8px 8px 12px; box-shadow: var(--gesso-shadow-md);
        }
        .composer-icons { display: flex; gap: 2px; flex-shrink: 0; align-items: center; }
        .icon-btn {
          width: 36px; height: 36px; border-radius: var(--gesso-radius-full);
          display: flex; align-items: center; justify-content: center; color: var(--gesso-fg-muted);
          transition: background var(--gesso-duration-fast) var(--gesso-easing-default), color var(--gesso-duration-fast); cursor: pointer;
        }
        .icon-btn:hover { background: var(--gesso-surface-recessed); color: var(--gesso-fg); }
        .icon-btn:active { transform: scale(0.92); }
        
        .composer-input {
          flex: 1; min-width: 0; font-family: var(--gesso-font-body); font-size: 15px; color: var(--gesso-fg);
          background: transparent; border: none; outline: none; padding: 8px 4px; line-height: 1.4; align-self: center;
        }
        .composer-input::placeholder { color: var(--gesso-fg-muted); }
        
        .send-btn {
          width: 40px; height: 40px; border-radius: var(--gesso-radius-full);
          background: var(--gesso-accent); color: var(--gesso-on-accent);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;
          transition: background var(--gesso-duration-fast) var(--gesso-easing-default), transform 80ms var(--gesso-easing-default);
        }
        .send-btn:hover { background: color-mix(in oklch, var(--gesso-accent) 88%, black); }
        .send-btn:active { transform: translateY(1px) scale(0.96); }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* DRAWER */
        .drawer-scrim {
          position: fixed; inset: 0; z-index: 190; background: rgba(26,26,26,0.35);
          opacity: 0; pointer-events: none; transition: opacity 220ms var(--gesso-easing-default);
        }
        .drawer-scrim.open { opacity: 1; pointer-events: auto; }
        
        .drawer {
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 200; width: 300px;
          background: var(--gesso-canvas); box-shadow: var(--gesso-shadow-lg);
          padding: 48px 16px 24px; display: flex; flex-direction: column; gap: 20px;
          transform: translateX(-100%); transition: transform 260ms var(--gesso-easing-default);
        }
        @media (min-width: 1024px) {
          .drawer { position: relative; transform: translateX(0); width: 300px; flex-shrink: 0; box-shadow: none; border-right: 1px solid rgba(0,0,0,0.05); }
          .drawer-scrim { display: none !important; }
        }
        .drawer.open { transform: translateX(0); }
        
        .drawer-brand { display: flex; align-items: center; gap: 12px; padding-bottom: 4px; }
        .drawer-brand .app-logo { width: 32px; height: 32px; }
        .drawer-brand .app-logo span { font-size: 12px; }
        .drawer-brand-name { font-family: var(--gesso-font-display); font-weight: 600; font-size: 16px; }

        .drawer-new {
          display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--gesso-radius-md);
          background: var(--gesso-surface); color: var(--gesso-fg); font-size: 14px; font-weight: 600; cursor: pointer;
          transition: background var(--gesso-duration-fast) var(--gesso-easing-default); box-shadow: var(--gesso-shadow-sm); border: none; width: 100%;
        }
        .drawer-new:hover { background: var(--gesso-surface-elevated); }
        .drawer-new:active { transform: scale(0.98); }
        
        .drawer-search-wrap {
          display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--gesso-radius-full);
          background: var(--gesso-surface-recessed); color: var(--gesso-fg-muted); font-size: 14px;
        }
        .drawer-search-wrap input { flex: 1; background: transparent; outline: none; border: none; font-size: 14px; }
        
        .drawer-nav { display: flex; flex-direction: column; gap: 4px; }
        .drawer-item {
          display: flex; align-items: center; gap: 12px; padding: 12px 12px; border-radius: var(--gesso-radius-md);
          color: var(--gesso-fg); font-size: 14px; font-weight: 500; cursor: pointer; text-align: left; width: 100%;
          transition: background var(--gesso-duration-fast) var(--gesso-easing-default);
        }
        .drawer-item:hover { background: rgba(26,26,26,0.05); }
        .drawer-item[aria-current="true"] { background: rgba(26,26,26,0.08); }
        .drawer-item .ic { color: var(--gesso-fg-muted); flex-shrink: 0; }

        .drawer-section-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gesso-fg-muted); font-weight: 500; padding: 4px 4px 0; }
        
        .drawer-history { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; flex: 1; }
        .hist-pill {
          display: flex; align-items: center; gap: 12px; padding: 12px 12px; border-radius: var(--gesso-radius-md);
          background: transparent; font-size: 13px; color: var(--gesso-fg); cursor: pointer;
          transition: background var(--gesso-duration-fast) var(--gesso-easing-default); width: 100%; text-align: left;
        }
        .hist-pill:hover { background: color-mix(in srgb, var(--gesso-surface-recessed) 80%, black 6%); }
        .hist-pill .dot { width: 8px; height: 8px; border-radius: var(--gesso-radius-full); flex-shrink: 0; }
        .hist-pill .title-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hist-pill button { opacity: 0.5; cursor: pointer; padding: 4px; }
        .hist-pill button:hover { opacity: 1; color: var(--gesso-error); }
      `}</style>

      {/* DRAWER & OVERLAY */}
      <div className={`drawer-scrim ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
      
      <aside className={`drawer ${sidebarOpen ? 'open' : ''}`}>
        <div className="drawer-brand">
          <div className="app-logo"><span>AI</span></div>
          <div className="drawer-brand-name">My AI</div>
        </div>
        
        <button className="drawer-new" onClick={createNewChat}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-7-7v14"/></svg> 
          New chat
        </button>

        <div className="drawer-search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic ic-sm"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input type="text" placeholder="Search chats" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
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
          {filteredSessions.map((s, i) => (
            <button key={s.id} className="hist-pill" onClick={() => { setCurrentSessionId(s.id); setActiveView('chat'); closeSidebarOnMobile(); }}>
              <span className="dot" style={{ background: i % 3 === 0 ? 'var(--gesso-accent)' : i % 3 === 1 ? 'var(--gesso-accent-2)' : 'var(--gesso-success)' }}></span>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic" style={{width: 24, height: 24}}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 12h16M4 19h16"/></svg>
            </button>
            <div className="app-logo"><span>AI</span></div>
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
                  <span>AI</span>
                </div>
                <div className="moment-status">
                  showing perfect responses<span className="dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`msg-row ${msg.sender}`}>
                  <div className={`bubble ${msg.sender} markdown-body`}>
                    {msg.sender === 'ai' && msg.text === '' && loading ? (
                      <span style={{ opacity: 0.7, fontStyle: 'italic' }}>Generating...</span>
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic" style={{width: 16, height: 16}}><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    {attachedFile}
                    <button className="remove" onClick={() => setAttachedFile(null)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic" style={{width: 10, height: 10, strokeWidth: 3}}><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
              )}
              
              <div className="composer">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                
                <div className="composer-icons">
                  <button className="icon-btn" onClick={() => alert("Plugins coming soon!")}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-7-7v14"/></svg>
                  </button>
                  <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic"><path strokeLinecap="round" strokeLinejoin="round" d="m16 6l-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>
                  </button>
                </div>
                
                <input 
                  className="composer-input"
                  type="text" 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} 
                  placeholder="Ask My AI anything..." 
                />
                
                <button className="send-btn" onClick={sendMessage} disabled={(!input.trim() && !attachedFile) || loading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="ic"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12l7-7l7 7m-7 7V5"/></svg>
                </button>
              </div>
              
            </div>
          </div>
        )}

      </div>
    </div>
  );
}