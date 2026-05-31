import React, { useState } from 'react';
import HomePage from './pages/HomePage';
import DemucsPage from './pages/DemucsPage';
import DownloadPage from './pages/DownloadPage';
import SharePage from './pages/SharePage';
import Summary from './pages/Summary';
import LogPage from './pages/LogPage';
import logo from './pages/logo.webp';

type TabType = 'home' | 'demucs' | 'download' | 'share' | 'summary' | 'logs';

interface MenuItem {
  id: TabType;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const ICONS = {
  music: <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />,
  layers: <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
  download: <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />,
  share: <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />,
  sliders: <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />,
  terminal: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 18L18 6M6 6l12 12" />,
  chevron: <path d="M9 5l7 7-7 7" />,
};

const MENU_ITEMS: MenuItem[] = [
  { id: 'home', label: 'RVC Studio', desc: 'แปลงเสียง AI', icon: ICONS.music },
  { id: 'demucs', label: 'Stem Splitter', desc: 'แยกเสียงดนตรี', icon: ICONS.layers },
  { id: 'download', label: 'Models', desc: 'จัดการโมเดล', icon: ICONS.download },
  { id: 'share', label: 'Library', desc: 'คลังไฟล์', icon: ICONS.share },
  { id: 'summary', label: 'Mix & Export', desc: 'มิกซ์เพลง', icon: ICONS.sliders },
  { id: 'logs', label: 'System Logs', desc: 'ดูระบบ', icon: ICONS.terminal },
];

const PAGES: Record<TabType, React.ReactNode> = {
  home: <HomePage />,
  demucs: <DemucsPage />,
  download: <DownloadPage />,
  share: <SharePage />,
  summary: <Summary />,
  logs: <LogPage />,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeItem = MENU_ITEMS.find(m => m.id === activeTab);

  const handleTab = (tab: TabType) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  return (
    <div className="flex h-screen w-full bg-[#0b0d11] text-slate-200 overflow-hidden">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative z-40 h-full w-72 
        bg-slate-950/80 backdrop-blur-xl border-r border-white/5
        flex flex-col transition-transform duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 blur-lg opacity-50" />
              <img src={logo} alt="GG Replay" className="relative w-10 h-10 object-cover rounded-xl shadow-lg" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">GG-Replay</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">AI Audio Studio</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <p className="px-3 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Workspace</p>
          {MENU_ITEMS.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTab(item.id)}
                className={`
                  group w-full flex items-center gap-3 px-3 py-3 rounded-xl
                  transition-all duration-200 cursor-pointer relative overflow-hidden
                  ${isActive
                    ? 'bg-gradient-to-r from-indigo-600/20 to-purple-600/10 text-white border border-indigo-500/30 shadow-lg shadow-indigo-500/10'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'}
                `}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-indigo-400 to-purple-500 rounded-r-full" />
                )}
                <div className={`
                  w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all
                  ${isActive
                    ? 'bg-gradient-to-br from-indigo-500/30 to-purple-500/30 text-indigo-300'
                    : 'bg-slate-900/60 text-slate-500 group-hover:bg-slate-800 group-hover:text-slate-300'}
                `}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-bold truncate">{item.label}</p>
                  <p className={`text-[10px] truncate ${isActive ? 'text-slate-400' : 'text-slate-600'}`}>
                    {item.desc}
                  </p>
                </div>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 space-y-3">
          <div className="px-3 py-2.5 bg-gradient-to-r from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">System Ready</p>
                <p className="text-[9px] text-slate-500 truncate">GPU Acceleration Active</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-2">
            <span className="text-[10px] text-slate-600 font-mono">v1.0.4-stable</span>
            <span className="text-[10px] text-slate-700">© 2026</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/40 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
            >
              <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {mobileOpen ? ICONS.close : ICONS.menu}
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs">Workspace</span>
              <svg className="w-3 h-3 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {ICONS.chevron}
              </svg>
              <span className="text-white text-sm font-bold">{activeItem?.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border border-white/5 rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-mono text-slate-400">CUDA 11.8</span>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">RTX 3050</span>
            </div>
          </div>
        </header>

      {/* Page Content */}
      <div className="flex-1 overflow-y-auto relative">
       {/* Ambient background glows */}
       <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 blur-[150px] rounded-full pointer-events-none" />
       <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-600/5 blur-[150px] rounded-full pointer-events-none" />

     {/* ✅ Pages - render ทุกหน้า แต่ซ่อนด้วย CSS */}
      <div className="relative z-10">
       {(Object.keys(PAGES) as TabType[]).map((key) => (
      <div
        key={key}
        style={{ display: activeTab === key ? 'contents' : 'none' }}
      >
        {PAGES[key]}
      </div>
    ))}
  </div>
</div>
      </main>
    </div>
  );
}