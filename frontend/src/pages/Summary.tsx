import React, { useState, useEffect } from 'react';
import * as Wails from '../../wailsjs/go/main/App';

interface InstTrack {
  path: string;
  name: string;
  volume: number;
  enabled: boolean;
}

const Summary: React.FC = () => {
  const [vocalFilesList, setVocalFilesList] = useState<string[]>([]);
  const [stemFilesList, setStemFilesList] = useState<string[]>([]);
  const [demucsFilesList, setDemucsFilesList] = useState<any[]>([]);
  const [selectedVocal, setSelectedVocal] = useState('');
  const [instTracks, setInstTracks] = useState<InstTrack[]>([]);
  const [vocalVolume, setVocalVolume] = useState(1.0);
  const [isMerging, setIsMerging] = useState(false);
  const [masterTrack, setMasterTrack] = useState<{ name: string; streamUrl: string; relPath: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customFileName, setCustomFileName] = useState('AI_Cover_Master');
  const [activePreview, setActivePreview] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => { fetchAvailableAssets(); }, []);

  const fetchAvailableAssets = async () => {
    try {
      const [vocals, stems, demucs] = await Promise.all([
        (Wails as any).GetAICoverFiles(),
        (Wails as any).GetSeparatedFiles(),
        (Wails as any).GetDemucsFiles(),
      ]);
      setVocalFilesList(vocals || []);
      setStemFilesList(stems || []);
      setDemucsFilesList(demucs || []);
    } catch (err) {
      console.error('Failed to scan assets:', err);
    }
  };

  const handleBrowseVocalFile = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res?.path) {
        setSelectedVocal(res.path);
      }
    } catch { alert('ไม่สามารถเลือกไฟล์เสียงร้องได้'); }
  };

  const handleBrowseInstrumentFile = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res?.path) addInstrumentTrack(res.path, res.name);
    } catch { alert('ไม่สามารถเลือกไฟล์ดนตรีได้'); }
  };

  const addInstrumentTrack = (path: string, name: string) => {
    if (instTracks.some(t => t.path === path)) return;
    setInstTracks(prev => [...prev, { path, name: cleanName(name), volume: 0.8, enabled: true }]);
  };

  const removeInstTrack = (index: number) => {
    setInstTracks(prev => prev.filter((_, i) => i !== index));
  };

  const toggleInstTrack = (index: number) => {
    setInstTracks(prev => prev.map((t, i) => i === index ? { ...t, enabled: !t.enabled } : t));
  };

  const updateInstVolume = (index: number, volume: number) => {
    setInstTracks(prev => prev.map((t, i) => i === index ? { ...t, volume } : t));
  };

  const handlePreviewTrack = async (path: string, name: string) => {
    try {
      let streamUrl: string;
      if (path.includes('demucs/')) {
        const file = demucsFilesList.find(f => `demucs/${f.relPath}` === path);
        streamUrl = file ? await (Wails as any).GetAudioUrlByFullPath(file.fullPath) : await (Wails as any).GetFileStreamUrl('outputs', path);
      } else {
        streamUrl = await (Wails as any).GetFileStreamUrl('outputs', path);
      }
      setActivePreview(activePreview?.name === name ? null : { name, url: streamUrl });
    } catch { alert('ไม่สามารถเล่นไฟล์นี้ได้'); }
  };

  const handlePreMergeClick = () => {
    if (!selectedVocal) return alert('⚠️ กรุณาเลือกเสียงร้อง AI');
    if (instTracks.filter(t => t.enabled).length === 0) return alert('⚠️ กรุณาเลือกอย่างน้อย 1 instrumental track');
    setIsModalOpen(true);
  };

  const handleMergeStudioMix = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsModalOpen(false);
    setIsMerging(true);
    setMasterTrack(null);
    const enabled = instTracks.filter(t => t.enabled);
    try {
      const res = await (Wails as any).MergeMultiTrack({
        vocalPath: selectedVocal,
        vocalVol: vocalVolume,
        instTracks: enabled.map(t => ({ path: t.path, volume: t.volume, name: t.name })),
        outputName: customFileName.trim(),
      });
      if (res?.status === 'success') {
        setMasterTrack({ name: res.fileName, streamUrl: res.streamUrl, relPath: res.relPath });
      } else {
        alert('❌ ' + (res?.message || 'Mix failed'));
      }
    } catch (err) { alert('Error: ' + err); }
    finally { setIsMerging(false); }
  };

  const handleExport = async () => {
    if (!masterTrack) return;
    try {
      const res = await (Wails as any).DownloadFile('outputs', masterTrack.relPath);
      if (res?.status === 'success') alert(`✅ บันทึกสำเร็จที่:\n${res.path}`);
    } catch { alert('เกิดข้อผิดพลาด'); }
  };

  const cleanName = (p: string) => p.replace(/\\/g, '/').split('/').pop() || p;
  const getIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('vocal')) return '🎤';
    if (n.includes('drum')) return '🥁';
    if (n.includes('bass')) return '🎸';
    if (n.includes('piano')) return '🎹';
    if (n.includes('guitar')) return '🎸';
    if (n.includes('other')) return '🎵';
    return '🎼';
  };

  const enabledCount = instTracks.filter(t => t.enabled).length;
  const step1Done = !!selectedVocal;
  const step2Done = enabledCount > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn text-slate-200 p-4 pb-24">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400">
          🎛️ Studio Master Mixer
        </h1>
        <p className="text-slate-400 text-sm">
          ผสมเสียงร้อง AI + ดนตรีหลายแทร็ก → สร้างเพลงฉบับสมบูรณ์
        </p>
      </header>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 p-4 bg-slate-900/40 rounded-2xl border border-white/5">
        <Step num={1} label="เลือกเสียงร้อง" done={step1Done} active={!step1Done} />
        <div className={`flex-1 h-0.5 ${step1Done ? 'bg-emerald-500' : 'bg-slate-800'}`} />
        <Step num={2} label="เพิ่มดนตรี" done={step2Done} active={step1Done && !step2Done} />
        <div className={`flex-1 h-0.5 ${step2Done ? 'bg-emerald-500' : 'bg-slate-800'}`} />
        <Step num={3} label="Mix & Export" done={!!masterTrack} active={step1Done && step2Done && !masterTrack} />
      </div>

      {/* Preview Player */}
      {activePreview && (
        <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-2xl space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 uppercase">🔊 Preview: {activePreview.name}</span>
            <button onClick={() => setActivePreview(null)} className="text-xs text-slate-400 hover:text-white">✕ ปิด</button>
          </div>
          <audio src={activePreview.url} controls autoPlay className="w-full h-8 accent-indigo-500" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT: Track Selection (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* STEP 1: Vocal */}
          <section className="p-6 bg-slate-900/40 rounded-2xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-xs font-black">1</span>
                🎤 เสียงร้อง AI
              </h2>
              {step1Done && <span className="text-xs text-emerald-400 font-bold">✓ เลือกแล้ว</span>}
            </div>

            <select
              value={selectedVocal.includes('/') ? '' : selectedVocal}
              onChange={(e) => setSelectedVocal(e.target.value)}
              className="w-full bg-slate-950 text-white rounded-xl p-3 text-sm border border-white/10 focus:border-indigo-500 outline-none cursor-pointer"
            >
              <option value="">-- เลือกเสียงร้อง AI --</option>
              {vocalFilesList.map(v => <option key={v} value={v}>{cleanName(v)}</option>)}
            </select>

            <div className="flex gap-2">
              <button
                onClick={handleBrowseVocalFile}
                className="flex-1 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-xs text-indigo-300 font-bold cursor-pointer transition-all"
              >
                📁 เลือกจากเครื่อง...
              </button>
            </div>

            {selectedVocal && (
              <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex items-center gap-2">
                <span className="text-2xl">🎤</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{cleanName(selectedVocal)}</p>
                  <p className="text-[10px] text-slate-500">เสียงร้องหลัก</p>
                </div>
              </div>
            )}
          </section>

          {/* STEP 2: Instruments */}
          <section className="p-6 bg-slate-900/40 rounded-2xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-xs font-black">2</span>
                🎸 ดนตรีประกอบ
              </h2>
              {step2Done && <span className="text-xs text-emerald-400 font-bold">{enabledCount} แทร็ก</span>}
            </div>

            {/* Add Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleBrowseInstrumentFile}
                className="py-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl text-xs text-purple-300 font-bold cursor-pointer transition-all"
              >
                ➕ เพิ่มจากเครื่อง
              </button>
              <button
                onClick={() => {
                  if (demucsFilesList.length === 0) return alert('ยังไม่มีไฟล์ Demucs');
                }}
                disabled={demucsFilesList.length === 0}
                className="py-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-xs text-indigo-300 font-bold cursor-pointer transition-all disabled:opacity-40"
              >
                📦 จาก Demucs ({demucsFilesList.length})
              </button>
            </div>

            {/* Quick Add: Demucs Stems */}
            {demucsFilesList.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase">เลือกจาก Demucs:</p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {demucsFilesList.map((f, i) => {
                    const path = `demucs/${f.relPath}`;
                    const added = instTracks.some(t => t.path === path);
                    return (
                      <button
                        key={i}
                        onClick={() => addInstrumentTrack(path, `${f.stemName}`)}
                        disabled={added}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-[11px] text-slate-300 cursor-pointer transition-all"
                      >
                        {getIcon(f.stemName)} {f.stemName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Add: UVR Stems */}
            {stemFilesList.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase">เลือกจาก UVR:</p>
                <div className="flex flex-wrap gap-1.5">
                  {stemFilesList.slice(0, 12).map(stem => {
                    const path = `stems/${stem}`;
                    const added = instTracks.some(t => t.path === path);
                    return (
                      <button
                        key={stem}
                        onClick={() => addInstrumentTrack(path, stem)}
                        disabled={added}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-[11px] text-slate-300 cursor-pointer transition-all"
                      >
                        {getIcon(stem)} {cleanName(stem)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tracks List */}
            {instTracks.length > 0 ? (
              <div className="space-y-2 pt-2 border-t border-white/5">
                <p className="text-[10px] font-bold text-purple-400 uppercase">แทร็กที่เพิ่ม ({instTracks.length})</p>
                {instTracks.map((track, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border transition-all ${
                      track.enabled ? 'bg-purple-950/20 border-purple-500/30' : 'bg-slate-950/30 border-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={track.enabled}
                        onChange={() => toggleInstTrack(i)}
                        className="w-4 h-4 accent-purple-500 cursor-pointer"
                      />
                      <span className="text-lg">{getIcon(track.name)}</span>
                      <span className="text-xs font-bold text-white truncate flex-1">{track.name}</span>
                      <button
                        onClick={() => handlePreviewTrack(track.path, track.name)}
                        className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                          activePreview?.name === track.name ? 'bg-rose-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {activePreview?.name === track.name ? '⏸' : '▶'}
                      </button>
                      <button
                        onClick={() => removeInstTrack(i)}
                        className="px-2 py-1 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded text-[10px] font-bold cursor-pointer"
                      >
                        🗑
                      </button>
                    </div>
                    <div className="flex items-center gap-2 ml-6">
                      <span className="text-[10px] text-slate-400 w-8">Vol</span>
                      <input
                        type="range"
                        min="0" max="2" step="0.05"
                        value={track.volume}
                        onChange={(e) => updateInstVolume(i, parseFloat(e.target.value))}
                        disabled={!track.enabled}
                        className="flex-1 accent-purple-500 h-1.5 bg-slate-800 rounded cursor-pointer disabled:opacity-30"
                      />
                      <span className="text-[10px] font-mono text-white bg-purple-500/10 px-2 py-0.5 rounded w-12 text-center">
                        {track.volume.toFixed(2)}x
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600 border-2 border-dashed border-white/5 rounded-xl">
                <div className="text-3xl mb-2">🎵</div>
                <p className="text-xs">ยังไม่มีแทร็กดนตรี</p>
                <p className="text-[10px] text-slate-700 mt-1">กดปุ่มด้านบนเพื่อเพิ่ม</p>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT: Mixer & Export (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Mixer Panel */}
          <section className="p-6 bg-gradient-to-br from-slate-900/60 to-slate-950/60 rounded-2xl border border-white/5 space-y-5 sticky top-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-black">3</span>
              🎚️ Mixer Control
            </h2>

            {/* Vocal Volume */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-indigo-400 font-bold">🎤 เสียงร้อง</span>
                <span className="font-mono text-white bg-indigo-500/10 px-2 py-0.5 rounded">{vocalVolume.toFixed(2)}x</span>
              </div>
              <input
                type="range" min="0.1" max="2.0" step="0.05"
                value={vocalVolume}
                onChange={(e) => setVocalVolume(parseFloat(e.target.value))}
                disabled={!step1Done}
                className="w-full accent-indigo-500 h-2 bg-slate-800 rounded cursor-pointer disabled:opacity-30"
              />
            </div>

            {/* Summary */}
            <div className="p-4 bg-slate-950/50 rounded-xl border border-white/5 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">🎤 Vocal</span>
                <span className="text-indigo-400 font-mono">{step1Done ? '✓' : '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">🎸 Instruments</span>
                <span className="text-purple-400 font-mono">{enabledCount} tracks</span>
              </div>
              <div className="flex justify-between text-xs pt-2 border-t border-white/5">
                <span className="text-slate-400 font-bold">📦 รวมทั้งหมด</span>
                <span className="text-emerald-400 font-mono font-bold">{enabledCount + (step1Done ? 1 : 0)}</span>
              </div>
            </div>

            {/* Mix Button */}
            <button
              disabled={isMerging || !step1Done || !step2Done}
              onClick={handlePreMergeClick}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white rounded-xl font-black shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-sm uppercase tracking-wider cursor-pointer"
            >
              {isMerging ? '⏳ กำลัง Mix...' : `🎵 MIX ${enabledCount + 1} TRACKS`}
            </button>
          </section>

          {/* Result */}
          {masterTrack && (
            <section className="p-6 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-emerald-400 uppercase">✅ Mix สำเร็จ!</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{masterTrack.name}</p>
                </div>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-all"
                >
                  💾 Export
                </button>
              </div>
              <audio src={masterTrack.streamUrl} controls autoPlay className="w-full h-10 accent-emerald-500" />
            </section>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <div>
              <h3 className="text-lg font-black text-white">💾 ตั้งชื่อไฟล์</h3>
              <p className="text-xs text-slate-400 mt-1">Mix {enabledCount + 1} tracks → MP3 320kbps</p>
            </div>
            <form onSubmit={handleMergeStudioMix} className="space-y-4">
              <input
                type="text" autoFocus value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                className="w-full bg-slate-950 text-emerald-400 font-mono rounded-xl p-3 text-sm border border-emerald-500/30 focus:border-emerald-500 outline-none"
                placeholder="My_Awesome_Cover"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs uppercase cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-black text-xs uppercase cursor-pointer">
                  🎵 Render
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Step indicator component
const Step = ({ num, label, done, active }: { num: number; label: string; done: boolean; active: boolean }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${
    done ? 'bg-emerald-500/20 text-emerald-400' :
    active ? 'bg-white/10 text-white' : 'bg-slate-800/50 text-slate-500'
  }`}>
    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
      done ? 'bg-emerald-500 text-white' : active ? 'bg-white text-slate-900' : 'bg-slate-700 text-slate-500'
    }`}>
      {done ? '✓' : num}
    </span>
    <span className="text-[11px] font-bold hidden sm:inline">{label}</span>
  </div>
);

export default Summary;