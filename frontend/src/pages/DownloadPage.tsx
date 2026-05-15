import React, { useState, useEffect } from 'react';
import * as Wails from '../../wailsjs/go/main/App';

const DownloadPage: React.FC = () => {
  const [models, setModels] = useState<string[]>([]);
  const [url, setUrl] = useState('');

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    const list = await Wails.GetStoredModels();
    setModels(list || []);
  };

  const handleImportLocal = async () => {
    try {
      const res = await Wails.SelectAndSaveModel();
      if (res && res.name) {
        alert(`นำเข้าโมเดล ${res.name} สำเร็จ!`);
        await loadModels();
      }
    } catch (err) {
      alert("นำเข้าโมเดลล้มเหลว");
    }
  };

  const handleDelete = async (name: string) => {
    if (window.confirm(`คุณต้องการลบโมเดล ${name} หรือไม่?`)) {
      await Wails.DeleteModel(name);
      await loadModels();
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Model Manager</h1>
          <p className="text-slate-400 text-sm">จัดการไฟล์โมเดล RVC (.pth)</p>
        </div>
        <button 
          onClick={handleImportLocal}
          className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Import Local Model
        </button>
      </div>
      
      <div className="glass-card p-2 rounded-2xl flex gap-2 mb-10 border border-white/5">
        <input 
          type="text" 
          placeholder="วาง Link ดาวน์โหลดโมเดล..." 
          className="flex-1 bg-transparent rounded-xl px-4 py-3 text-sm outline-none text-white"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all">
          Download
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {models.map(model => (
          <div key={model} className="glass-card p-4 rounded-2xl flex items-center justify-between group hover:border-indigo-500/30 transition-all border border-white/5">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{model}</p>
                <p className="text-[10px] text-slate-500">READY TO USE</p>
              </div>
            </div>
            <button onClick={() => handleDelete(model)} className="p-2 hover:bg-red-500/20 text-slate-500 hover:text-red-500 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DownloadPage;