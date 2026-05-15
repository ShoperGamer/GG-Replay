import React, { useState, useEffect } from 'react';

interface WaveformProps {
  audioUrl?: string;
  color?: string;
  waveSize?: number;
}

const Waveform: React.FC<WaveformProps> = ({ audioUrl, color = "#6366f1", waveSize = 60 }) => {
  const [playing, setPlaying] = useState(false);
  const [bars, setBars] = useState<number[]>([]);

  useEffect(() => {
    // สุ่มความสูงแท่งกราฟเริ่มต้น
    const newBars = Array.from({ length: waveSize }, () => Math.floor(Math.random() * 70) + 10);
    setBars(newBars);
  }, [waveSize]);

  return (
    <div className="glass-card p-4 rounded-2xl flex items-center gap-4 w-full border border-white/5">
      <button 
        onClick={() => setPlaying(!playing)}
        className="w-10 h-10 rounded-full bg-indigo-500 hover:bg-indigo-400 flex items-center justify-center text-white transition-all shadow-lg shadow-indigo-500/20 flex-shrink-0 active:scale-90"
      >
        {playing ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
        ) : (
          <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>

      <div className="flex-1 flex items-center gap-[2px] h-10 overflow-hidden">
        {bars.map((h, i) => (
          <div 
            key={i} 
            className={`flex-1 rounded-full transition-all duration-500 ${playing ? 'animate-pulse' : ''}`}
            style={{ 
              height: `${playing ? Math.random() * 100 : h}%`, 
              backgroundColor: color,
              opacity: playing ? 1 : 0.3
            }}
          ></div>
        ))}
      </div>
      
      <div className="flex flex-col items-end flex-shrink-0">
        <span className="text-[9px] font-mono text-slate-500">00:00 / --:--</span>
        <div className="w-2 h-2 rounded-full bg-green-500 mt-1 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
      </div>
    </div>
  );
};

export default Waveform;