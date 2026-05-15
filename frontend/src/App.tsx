import React, { useState } from 'react';
import HomePage from './pages/HomePage';
import DemucsPage from './pages/DemucsPage';
import DownloadPage from './pages/DownloadPage';
import SharePage from './pages/SharePage';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <div className="flex h-screen w-full bg-[#0b0d11] text-slate-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 flex flex-col p-6 glass-card z-20">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg shadow-indigo-500/30"></div>
          <span className="text-xl font-bold tracking-tight text-white italic">GG-Replay</span>
        </div>

        <nav className="flex-1 space-y-2">
          <MenuBtn 
            active={activeTab === 'home'} 
            onClick={() => setActiveTab('home')}
            label="RVC Inference" 
            icon={<><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></>} 
          />
          <MenuBtn 
            active={activeTab === 'demucs'} 
            onClick={() => setActiveTab('demucs')}
            label="Stem Splitter" 
            icon={<><path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></>} 
          />
          <MenuBtn 
            active={activeTab === 'download'} 
            onClick={() => setActiveTab('download')}
            label="Model Manager" 
            icon={<><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></>} 
          />
          <MenuBtn 
            active={activeTab === 'share'} 
            onClick={() => setActiveTab('share')}
            label="History & Share" 
            icon={<><path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></>} 
          />
        </nav>
        
        <div className="mt-auto pt-6 border-t border-white/5 text-[10px] text-slate-600 text-center uppercase tracking-widest">
          Build v1.0.4-Stable
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto p-10 relative">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 blur-[150px] rounded-full -z-10 animate-pulse"></div>
        {activeTab === 'home' && <HomePage />}
        {activeTab === 'demucs' && <DemucsPage />}
        {activeTab === 'download' && <DownloadPage />}
        {activeTab === 'share' && <SharePage />}
      </main>
    </div>
  );
};

const MenuBtn = ({ active, onClick, label, icon }: any) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
      active 
      ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]' 
      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
    }`}
  >
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      {icon}
    </svg>
    <span className="font-semibold text-sm whitespace-nowrap">{label}</span>
  </button>
);

export default App;