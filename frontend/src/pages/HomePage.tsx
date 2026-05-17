import React, { useState, useEffect } from 'react';
import Waveform from '../components/Waveform';
import * as Wails from '../../wailsjs/go/main/App'; 

interface SongOptions {
  pitch: number;
  instrumentalsPitch: number;
  preStemmed: boolean;
  vocalsOnly: boolean;
  sampleMode: boolean;
  deEchoDeReverb: boolean;
  sampleModeStartTime: number;
  f0Method: string;
  stemmingMethod: string;
  indexRatio: number;
  consonantProtection: number;
  outputFormat: string;
  volumeEnvelope: number;
}

const HomePage: React.FC = () => {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [audioFile, setAudioFile] = useState<{name: string, path: string} | null>(null);
  const [outputFile, setOutputFile] = useState<{name: string, path: string, fullPath: string} | null>(null);
  const [pitch, setPitch] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [showWizard, setShowWizard] = useState(false);
  const [activeDevice, setActiveDevice] = useState('cuda');
  const [wizardSelection, setWizardSelection] = useState('cuda');

  const [deEchoDeReverb, setDeEchoDeReverb] = useState(false);
  const [instrumentalsPitch, setInstrumentalsPitch] = useState(0);
  const [f0Method, setF0Method] = useState('rmvpe');
  const [outputFormat, setOutputFormat] = useState('mp3_192k');
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [indexRatio, setIndexRatio] = useState(0.45); 
  const [consonantProtection, setConsonantProtection] = useState(0.40); 
  const [volumeEnvelope, setVolumeEnvelope] = useState(1.0);
  const [stemmingMethod, setStemmingMethod] = useState('UVR-MDX-NET Voc FT');

  useEffect(() => {
    loadModels();
    checkHardwareSetting();
  }, []);

  const checkHardwareSetting = async () => {
    try {
      const savedDevice = await (Wails as any).GetDeviceSetting();
      if (!savedDevice) {
        setShowWizard(true);
      } else {
        setActiveDevice(savedDevice);
        setWizardSelection(savedDevice);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveHardware = async () => {
    try {
      await (Wails as any).SaveDeviceSetting(wizardSelection);
      setActiveDevice(wizardSelection);
      setShowWizard(false);
      alert("ปรับค่าฮาร์ดแวร์เสร็จสิ้น!");
    } catch (err) {
      alert("Error saving setting");
    }
  };

  const loadModels = async () => {
    try {
      const list = await Wails.GetStoredModels();
      setModels(list || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectAudio = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res && res.name) {
        const streamUrl = await (Wails as any).GetAudioUrl(res.name, "uploads");
        setAudioFile({ name: res.name, path: streamUrl });
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเลือกไฟล์เสียงร้อง");
    }
  };

  const adjustValue = (current: number, step: number, min: number, max: number, setter: (v: number) => void) => {
    const next = parseFloat((current + step).toFixed(2));
    if (next >= min && next <= max) setter(next);
  };

  const handleRunInference = async () => {
    if (!audioFile || !selectedModel) return alert("กรุณาเลือกโมเดลและไฟล์เสียงร้องก่อน");
    
    setIsLoading(true);
    setProgress(0);
    setOutputFile(null); 

    try {
      const options: SongOptions = {
        pitch: pitch,
        instrumentalsPitch: instrumentalsPitch,
        preStemmed: true, 
        vocalsOnly: false,
        sampleMode: false,
        deEchoDeReverb: deEchoDeReverb,
        sampleModeStartTime: 0,
        f0Method: f0Method,
        stemmingMethod: stemmingMethod,
        indexRatio: indexRatio,
        consonantProtection: consonantProtection,
        outputFormat: outputFormat,
        volumeEnvelope: volumeEnvelope
      };

      const jobId = await Wails.CreateSong(selectedModel, audioFile.name, options);
      if (!jobId) throw new Error("ไม่สามารถเริ่มการประมวลผลได้");

      const interval = setInterval(async () => {
        const jobStatus: any = await Wails.GetJobProgress(jobId);
        
        if (jobStatus) {
           if (jobStatus.progress !== undefined) {
             setProgress(Math.round(jobStatus.progress));
           } else if (jobStatus.status === 'processing') {
             setProgress(prev => (prev < 95 ? prev + 2 : prev));
           }
           
           if (jobStatus.status === 'success' || jobStatus.status === 'completed') {
             clearInterval(interval);
             setIsLoading(false);
             setProgress(100);
             
             if (jobStatus.outputFilepath) {
                const streamOutputUrl = await (Wails as any).GetAudioUrlByFullPath(jobStatus.outputFilepath);
                const outName = jobStatus.outputFilepath.split(/[\\/]/).pop() || "converted_vocals.wav";
                setOutputFile({ name: outName, path: streamOutputUrl, fullPath: jobStatus.outputFilepath });
             }
             alert("แปลงน้ำเสียง AI Cover เสร็จสมบูรณ์! เชิญก้าวเข้าสู่เมนูพรีเซนต์รวมเสียงถัดไปได้เลย");
           } else if (jobStatus.status === 'failed' || jobStatus.status === 'errored') {
             clearInterval(interval);
             setIsLoading(false);
             alert("การประมวลผลล้มเหลว: " + (jobStatus.error || "Unknown Inference Error"));
           }
        }
      }, 1500);

    } catch (err) {
      setIsLoading(false);
      alert("Error: " + err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto animate-fadeIn text-slate-200 p-6 relative">
      
      <div className="flex flex-col sm:flex-row items-center justify-between mb-8 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            RVC Voice Conversion Studio
          </h1>
          <p className="text-slate-500 text-xs mt-1">โหมดสลับอินเฟอเรนซ์น้ำเสียงความเร็วสูง (ข้ามขั้นตอนตัดดนตรีอัตโนมัติ)</p>
        </div>
        <button 
          onClick={() => setShowWizard(true)}
          className={`mt-4 sm:mt-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all hover:scale-105 active:scale-95 ${
            activeDevice === 'cuda' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          }`}
        >
          {activeDevice === 'cuda' ? '⚡ NVIDIA GPU (CUDA)' : '💻 CPU RENDER'}
          <span className="text-[10px] opacity-60 underline pl-1">(เปลี่ยน)</span>
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-card p-5 rounded-2xl border border-white/5 bg-slate-950/40 backdrop-blur shadow-xl">
            <label className="block text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2.5">Voice Model Target</label>
            <select 
              className="w-full bg-slate-900 text-white rounded-xl p-3 text-sm outline-none border border-white/10 focus:border-indigo-500 transition-all cursor-pointer"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="">-- เลือกโมเดลเสียง --</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="glass-card p-5 rounded-2xl border border-white/5 bg-slate-950/40 backdrop-blur shadow-xl">
            <div className="flex justify-between mb-3">
              <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Pitch Transpose</label>
              <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono text-xs rounded-full font-bold">
                {pitch > 0 ? `+${pitch} SEMI` : pitch === 0 ? 'ORIGINAL' : `${pitch} SEMI`}
              </span>
            </div>
            <input 
              type="range" min="-12" max="12" 
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
              value={pitch} 
              onChange={(e) => setPitch(parseInt(e.target.value))}
            />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div 
            onClick={handleSelectAudio}
            className={`glass-card h-32 rounded-3xl border-dashed border-2 transition-all flex flex-col items-center justify-center cursor-pointer shadow-xl ${
              audioFile ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-white/10 hover:border-indigo-500/30 bg-slate-950/10'
            }`}
          >
            {audioFile ? (
              <div className="text-center p-4">
                <p className="text-white font-semibold truncate max-w-sm px-4 text-sm">🎵 {audioFile.name}</p>
                <button className="text-[11px] text-slate-400 hover:text-indigo-400 mt-1 underline">คลิกเพื่อเปลี่ยนไฟล์เสียงร้องเดี่ยว</button>
              </div>
            ) : (
              <p className="text-slate-400 text-xs font-medium">กดเลือกไฟล์เสียงร้องนำ (ที่แยกคัดกรองเสียงประสานออกแล้ว)</p>
            )}
          </div>

          <div className="glass-card p-5 rounded-3xl border border-white/5 bg-slate-950/30 backdrop-blur space-y-4 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">De-Echo & Reverb</h4>
                  <p className="text-[10px] text-slate-400">ล้างเศษเอฟเฟกต์สะท้อนของห้องร้องเพลง</p>
                </div>
                <button onClick={() => setDeEchoDeReverb(!deEchoDeReverb)} className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all ${deEchoDeReverb ? 'bg-indigo-600 justify-end' : 'bg-slate-800 justify-start'}`}><span className="bg-white w-4 h-4 rounded-full shadow-md" /></button>
              </div>

              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Instrumental Pitch</h4>
                  <p className="text-[10px] text-slate-400">คุมระดับโทนคีย์ดนตรีคู่ขนาน</p>
                </div>
                <div className="flex items-center bg-slate-950/60 rounded-xl border border-white/10 p-1">
                  <button onClick={() => adjustValue(instrumentalsPitch, -1, -24, 24, setInstrumentalsPitch)} className="w-6 h-6 text-xs font-bold text-slate-400 bg-white/5 rounded-md cursor-pointer">-</button>
                  <span className="w-8 text-center text-xs font-mono font-bold text-white">{instrumentalsPitch}</span>
                  <button onClick={() => adjustValue(instrumentalsPitch, 1, -24, 24, setInstrumentalsPitch)} className="w-6 h-6 text-xs font-bold text-slate-400 bg-white/5 rounded-md cursor-pointer">+</button>
                </div>
              </div>

              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 flex flex-col justify-center space-y-1.5">
                <h4 className="text-xs font-bold text-white">Pitch Detection (f0)</h4>
                <select value={f0Method} onChange={(e) => setF0Method(e.target.value)} className="w-full bg-slate-950 text-xs text-slate-200 border border-white/10 p-2 rounded-lg outline-none cursor-pointer">
                  <option value="rmvpe">Mangio-RMVPE (คัดกรองสัญญาณแม่นยำสูง)</option>
                  <option value="crepe">Crepe (เกาะโน้ตเสียงหลบได้เนียนหนา)</option>
                </select>
              </div>

              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 flex flex-col justify-center space-y-1.5">
                <h4 className="text-xs font-bold text-white">Output Format</h4>
                <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className="w-full bg-slate-950 text-xs text-slate-200 border border-white/10 p-2 rounded-lg outline-none cursor-pointer">
                  <option value="mp3_320k">mp3 320k (ความละเอียดมัลติมีเดียสูงสุด)</option>
                  <option value="wav">wav (คลื่นเสียงดิบ Uncompressed)</option>
                </select>
              </div>
            </div>

            <div className="pt-1 text-center">
              <button onClick={() => setShowAdvanced(!showAdvanced)} className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest text-slate-400 hover:text-indigo-400 bg-white/5 px-4 py-1.5 rounded-full cursor-pointer transition-all">
                ADVANCED SETTINGS <span className={`transform transition-transform text-xs ${showAdvanced ? 'rotate-180' : ''}`}>^</span>
              </button>
            </div>

            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5 animate-fadeIn">
                <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex flex-col justify-between space-y-1.5">
                  <div className="flex justify-between"><span className="text-xs font-bold text-white">Index Ratio</span>
                    <div className="flex items-center bg-slate-950/60 rounded-md border border-white/10 px-1">
                      <button onClick={() => adjustValue(indexRatio, -0.01, 0.0, 1.0, setIndexRatio)} className="px-1 text-[10px] text-slate-400">-</button>
                      <span className="w-8 text-center text-[10px] font-mono font-bold text-white">{indexRatio}</span>
                      <button onClick={() => adjustValue(indexRatio, 0.01, 0.0, 1.0, setIndexRatio)} className="px-1 text-[10px] text-slate-400">+</button>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex flex-col justify-between space-y-1.5">
                  <div className="flex justify-between"><span className="text-xs font-bold text-white">Consonant Protection</span>
                    <div className="flex items-center bg-slate-950/60 rounded-md border border-white/10 px-1">
                      <button onClick={() => adjustValue(consonantProtection, -0.01, 0.0, 0.5, setConsonantProtection)} className="px-1 text-[10px] text-slate-400">-</button>
                      <span className="w-8 text-center text-[10px] font-mono font-bold text-white">{consonantProtection}</span>
                      <button onClick={() => adjustValue(consonantProtection, 0.01, 0.0, 0.5, setConsonantProtection)} className="px-1 text-[10px] text-slate-400">+</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button disabled={isLoading || !audioFile || !selectedModel} onClick={handleRunInference} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white rounded-2xl font-bold shadow-xl disabled:opacity-20 transition-all active:scale-[0.99] text-xs tracking-wider uppercase">
            {isLoading ? `กำลังแปลงกระบวนการสัญญาณเสียง... ${progress}%` : "CONVERT VOICE NOW"}
          </button>

          <div className="space-y-4">
            {outputFile && (
              <div className="p-4 bg-emerald-950/10 rounded-2xl border border-emerald-500/20 shadow-lg animate-fadeIn">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">✨ Converted AI Vocal Stack Ready</p>
                <p className="text-[10px] text-slate-500 font-mono mb-2 truncate">Location: {outputFile.name}</p>
                <div className="bg-emerald-950/20 p-3 rounded-xl space-y-3 border border-emerald-500/10">
                  <Waveform color="#10b981" audioUrl={outputFile.path} />
                  <audio src={outputFile.path} controls className="w-full h-8 rounded-lg opacity-95 accent-emerald-500" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showWizard && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-6 text-center">
            <h2 className="text-xl font-black text-white uppercase">Hardware Configuration</h2>
            <div className="grid grid-cols-1 gap-3 text-left">
              <div onClick={() => setWizardSelection('cuda')} className={`p-4 rounded-xl border cursor-pointer ${wizardSelection === 'cuda' ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-950/40 border-white/5'}`}><span className="text-sm font-bold text-white block">⚡ NVIDIA GPU (CUDA MODE)</span></div>
              <div onClick={() => setWizardSelection('cpu')} className={`p-4 rounded-xl border cursor-pointer ${wizardSelection === 'cpu' ? 'bg-amber-600/20 border-amber-500' : 'bg-slate-950/40 border-white/5'}`}><span className="text-sm font-bold text-white block">💻 CPU RENDER MODE</span></div>
            </div>
            <button onClick={handleSaveHardware} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl text-sm">SAVE SETTING</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;