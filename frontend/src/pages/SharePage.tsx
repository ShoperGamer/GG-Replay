import React from 'react';
import Waveform from '../components/Waveform';

const SharePage: React.FC = () => {
  // ข้อมูลจำลองสำหรับหน้า Share/History
  const historyItems = [
    { id: 1, name: "Vocal_Output_Final.wav", model: "Aria_V2", date: "2 mins ago" },
    { id: 2, name: "Song_Instrumental.mp3", model: "Demucs_Base", date: "1 hour ago" },
  ];

  return (
    <div className="max-w-5xl mx-auto animate-fadeIn space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Export & History</h1>
          <p className="text-slate-400">จัดการและฟังไฟล์เสียงที่ประมวลผลเสร็จแล้ว</p>
        </div>
        <button className="px-5 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl hover:bg-indigo-600/30 transition-all text-sm font-medium">
          Download All (.zip)
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {historyItems.map((item) => (
          <div key={item.id} className="glass-card p-6 rounded-3xl flex flex-col md:flex-row items-center gap-6 group hover:border-white/10 transition-all">
            <div className="flex-1 w-full space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    {item.name}
                  </h3>
                  <div className="flex gap-3 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                    <span>Model: {item.model}</span>
                    <span>•</span>
                    <span>{item.date}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                   </button>
                   <button className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                   </button>
                </div>
              </div>
              
              {/* เรียกใช้ Waveform พร้อมส่ง waveSize ที่เคย Error */}
              <Waveform audioUrl={`/path/to/${item.name}`} waveSize={80} color="#818cf8" />
            </div>
          </div>
        ))}

        {historyItems.length === 0 && (
          <div className="text-center py-20 glass-card rounded-3xl border-dashed border-2 border-white/5">
            <p className="text-slate-500 italic">ยังไม่มีประวัติการแปลงเสียง</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SharePage;