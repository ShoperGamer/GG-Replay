import React, { useState, useEffect, useRef } from 'react';
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
  outputName: string;
  device: string;
  gpu: boolean;
  removeHum: boolean;
  removeBackingVocals: boolean;
  applyPostProcessing: boolean;
  aggressiveCleanup: boolean;
}

type DeviceType = 'cuda' | 'mps' | 'cpu';

export default function HomePage() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [audioFile, setAudioFile] = useState<{ name: string; path: string } | null>(null);
  const [outputFile, setOutputFile] = useState<{ name: string; path: string; fullPath: string } | null>(null);
  const [pitch, setPitch] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [activeDevice, setActiveDevice] = useState<DeviceType>('cuda');
  const [showFilenameModal, setShowFilenameModal] = useState(false);
  const [customFilename, setCustomFilename] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Quick Settings
  const [outputFormat, setOutputFormat] = useState('mp3_320k');
  const [f0Method, setF0Method] = useState('rmvpe');
  
  // Advanced Settings
  const [deEchoDeReverb, setDeEchoDeReverb] = useState(false);
  const [instrumentalsPitch, setInstrumentalsPitch] = useState(0);
  const [indexRatio, setIndexRatio] = useState(0.45);
  const [consonantProtection, setConsonantProtection] = useState(0.40);
  const [volumeEnvelope, setVolumeEnvelope] = useState(1.0);
  const [stemmingMethod, setStemmingMethod] = useState('UVR-MDX-NET-Voc_FT');
  
  // Audio Cleanup
  const [removeHum, setRemoveHum] = useState(true);
  const [removeBackingVocals, setRemoveBackingVocals] = useState(true);
  const [applyPostProcessing, setApplyPostProcessing] = useState(true);
  const [aggressiveCleanup, setAggressiveCleanup] = useState(false);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadModels();
    loadDeviceSetting();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const loadModels = async () => {
    try {
      const list = await Wails.GetStoredModels();
      setModels(list || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadDeviceSetting = async () => {
    try {
      const saved = await (Wails as any).GetDeviceSetting();
      if (saved && ['cuda', 'mps', 'cpu'].includes(saved)) {
        setActiveDevice(saved as DeviceType);
      }
    } catch {}
  };

  const handleSaveDevice = async (device: DeviceType) => {
    setActiveDevice(device);
    try {
      await (Wails as any).SaveDeviceSetting(device);
    } catch {}
  };

  const handleSelectAudio = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res?.name) {
        const streamUrl = await (Wails as any).GetAudioUrl(res.name, 'uploads');
        setAudioFile({ name: res.name, path: streamUrl });
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการเลือกไฟล์เสียง');
    }
  };

  const handleOpenFilenameModal = () => {
    if (!audioFile || !selectedModel) {
      return alert('กรุณาเลือกโมเดลและไฟล์เสียงก่อน');
    }
    const baseName = audioFile.name.replace(/\.[^/.]+$/, '');
    setCustomFilename(`${baseName}_cover`);
    setShowFilenameModal(true);
  };

  const handleRunInference = async () => {
    if (!audioFile || !customFilename.trim()) return;
    setShowFilenameModal(false);
    setIsLoading(true);
    setProgress(0);
    setProgressMessage('กำลังเริ่มต้น...');
    setOutputFile(null);

    if (intervalRef.current) clearInterval(intervalRef.current);

    try {
      const options: SongOptions = {
        pitch,
        instrumentalsPitch,
        preStemmed: true,
        vocalsOnly: false,
        sampleMode: false,
        deEchoDeReverb,
        sampleModeStartTime: 0,
        f0Method,
        stemmingMethod,
        indexRatio,
        consonantProtection,
        outputFormat,
        volumeEnvelope,
        outputName: customFilename.trim(),
        device: activeDevice,
        gpu: activeDevice === 'cuda',
        removeHum,
        removeBackingVocals,
        applyPostProcessing,
        aggressiveCleanup,
      };

      const jobId = await Wails.CreateSong(selectedModel, audioFile.name, options);
      if (!jobId) throw new Error('ไม่สามารถเริ่มการประมวลผลได้');

      intervalRef.current = setInterval(async () => {
        try {
          const jobStatus: any = await Wails.GetJobProgress(jobId);
          if (!jobStatus) return;

          const msg = (jobStatus.message || '').toLowerCase();
          let realProgress = 0;

          if (jobStatus.status === 'completed' || jobStatus.status === 'success') {
            realProgress = 100;
          } else if (msg.includes('writing') || msg.includes('mixing')) {
            realProgress = 90;
          } else if (msg.includes('loading converted')) {
            realProgress = 75;
          } else if (msg.includes('creating audio')) {
            realProgress = 55;
          } else if (msg.includes('inference')) {
            realProgress = 30;
          } else if (msg.includes('loading model')) {
            realProgress = 15;
          } else if (jobStatus.status === 'processing') {
            realProgress = 5;
          }

          setProgress(realProgress);
          setProgressMessage(jobStatus.message || 'กำลังประมวลผล...');

          if (jobStatus.status === 'completed' || jobStatus.status === 'success') {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsLoading(false);
            setProgress(100);

            if (jobStatus.outputFilepath) {
              const streamUrl = await (Wails as any).GetAudioUrlByFullPath(jobStatus.outputFilepath);
              const outName = jobStatus.outputFilepath.split(/[\\/]/).pop() || 'converted.wav';
              setOutputFile({ name: outName, path: streamUrl, fullPath: jobStatus.outputFilepath });
            }
          } else if (jobStatus.status === 'errored' || jobStatus.status === 'failed') {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsLoading(false);
            alert('การประมวลผลล้มเหลว: ' + (jobStatus.message || jobStatus.error || 'Unknown Error'));
          }
        } catch (err) {
          console.error(err);
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsLoading(false);
        }
      }, 1500);
    } catch (err) {
      setIsLoading(false);
      alert('Error: ' + err);
    }
  };

  const canStart = audioFile && selectedModel && !isLoading;
  const step1Done = !!selectedModel;
  const step2Done = !!audioFile;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn text-slate-200 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            🎤 RVC Voice Studio
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            แปลงเสียงร้องด้วย AI — เลือกโมเดล → เลือกไฟล์ → แปลง
          </p>
        </div>
        
        {/* Device Selector */}
        <div className="flex gap-1 p-1 bg-slate-900/60 rounded-xl border border-white/5">
          <button
            onClick={() => handleSaveDevice('cuda')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeDevice === 'cuda'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            ⚡ GPU
          </button>
          <button
            onClick={() => handleSaveDevice('mps')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeDevice === 'mps'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            🍎 MPS
          </button>
          <button
            onClick={() => handleSaveDevice('cpu')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeDevice === 'cpu'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            💻 CPU
          </button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 p-4 bg-slate-900/40 rounded-2xl border border-white/5">
        <StepIndicator num={1} label="โมเดล" done={step1Done} active={!step1Done} />
        <div className={`flex-1 h-0.5 ${step1Done ? 'bg-emerald-500' : 'bg-slate-800'}`} />
        <StepIndicator num={2} label="ไฟล์เสียง" done={step2Done} active={step1Done && !step2Done} />
        <div className={`flex-1 h-0.5 ${step2Done ? 'bg-emerald-500' : 'bg-slate-800'}`} />
        <StepIndicator num={3} label="ตั้งค่า" done={isLoading || !!outputFile} active={step1Done && step2Done && !isLoading && !outputFile} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Controls */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Step 1: Model Selection */}
          <section className="p-6 bg-slate-900/40 rounded-2xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-xs font-black">1</span>
                🧠 เลือกโมเดลเสียง
              </h2>
              {step1Done && <span className="text-xs text-emerald-400 font-bold">✓ เลือกแล้ว</span>}
            </div>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-slate-950 text-white rounded-xl p-3 text-sm border border-white/10 focus:border-indigo-500 outline-none cursor-pointer"
            >
              <option value="">-- เลือกโมเดล AI --</option>
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {models.length === 0 && (
              <p className="text-xs text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                ⚠️ ยังไม่มีโมเดล — ไปที่หน้า Download เพื่อเพิ่มโมเดล
              </p>
            )}
          </section>

          {/* Step 2: Audio Selection */}
          <section className="p-6 bg-slate-900/40 rounded-2xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-xs font-black">2</span>
                🎵 เลือกไฟล์เสียง
              </h2>
              {step2Done && <span className="text-xs text-emerald-400 font-bold">✓ เลือกแล้ว</span>}
            </div>

            <button
              onClick={handleSelectAudio}
              className={`w-full p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                audioFile
                  ? 'bg-purple-500/10 border-purple-500/50 hover:border-purple-500'
                  : 'bg-slate-950/50 border-slate-700 hover:border-purple-500/50'
              }`}
            >
              {audioFile ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎵</span>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-white truncate">{audioFile.name}</p>
                    <p className="text-[10px] text-slate-400">คลิกเพื่อเปลี่ยนไฟล์</p>
                  </div>
                  <span className="text-emerald-400 text-lg">✓</span>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-3xl mb-2">📂</div>
                  <p className="text-sm text-slate-300">คลิกเพื่อเลือกไฟล์เสียงร้อง</p>
                  <p className="text-[10px] text-slate-500 mt-1">รองรับ MP3, WAV, FLAC</p>
                </div>
              )}
            </button>

            {/* Audio Preview */}
            {audioFile && (
              <div className="p-3 bg-slate-950/50 rounded-xl border border-white/5">
                <audio src={audioFile.path} controls className="w-full h-10 accent-purple-500" />
              </div>
            )}
          </section>

          {/* Step 3: Settings */}
          <section className="p-6 bg-slate-900/40 rounded-2xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-black">3</span>
                ⚙️ ตั้งค่า
              </h2>
            </div>

            {/* Pitch Control */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-white">🎼 ระดับเสียง (Pitch)</label>
                <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 font-mono text-xs rounded-full font-bold">
                  {pitch > 0 ? `+${pitch}` : pitch === 0 ? '0' : pitch} SEMI
                </span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                value={pitch}
                onChange={(e) => setPitch(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>-12 (ต่ำ)</span>
                <span>0 (เดิม)</span>
                <span>+12 (สูง)</span>
              </div>
            </div>

            {/* Quick Settings Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">รูปแบบ Output</label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-white border border-white/10 p-2.5 rounded-lg outline-none cursor-pointer"
                >
                  <option value="mp3_320k">MP3 320k (แนะนำ)</option>
                  <option value="mp3_192k">MP3 192k</option>
                  <option value="wav">WAV (Lossless)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">วิธีตรวจจับ Pitch</label>
                <select
                  value={f0Method}
                  onChange={(e) => setF0Method(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-white border border-white/10 p-2.5 rounded-lg outline-none cursor-pointer"
                >
                  <option value="rmvpe">RMVPE (แนะนำ)</option>
                  <option value="crepe">Crepe</option>
                </select>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full py-2.5 bg-slate-950/50 hover:bg-slate-950 border border-white/5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              การตั้งค่าขั้นสูง
              <span className={`transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {/* Advanced Settings */}
            {showAdvanced && (
              <div className="space-y-4 pt-4 border-t border-white/5 animate-fadeIn">
                {/* Audio Cleanup Section */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-amber-400 uppercase">🧹 Audio Cleanup</p>
                  <div className="grid grid-cols-2 gap-2">
                    <ToggleSwitch
                      label="ลดเสียงฮัม"
                      desc="ตัด DC Offset"
                      checked={removeHum}
                      onChange={() => setRemoveHum(!removeHum)}
                    />
                    <ToggleSwitch
                      label="ลบ Backing Vocals"
                      desc="ตัดเสียงประสาน"
                      checked={removeBackingVocals}
                      onChange={() => setRemoveBackingVocals(!removeBackingVocals)}
                    />
                    <ToggleSwitch
                      label="De-Echo & Reverb"
                      desc="ลดเสียงก้อง"
                      checked={deEchoDeReverb}
                      onChange={() => setDeEchoDeReverb(!deEchoDeReverb)}
                    />
                    <ToggleSwitch
                      label="Post-Processing"
                      desc="Noise Gate"
                      checked={applyPostProcessing}
                      onChange={() => setApplyPostProcessing(!applyPostProcessing)}
                    />
                  </div>
                </div>

                {/* Fine-tuning Section */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase">🎛️ Fine-tuning</p>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Index Ratio</span>
                      <span className="font-mono text-white">{indexRatio.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={indexRatio}
                      onChange={(e) => setIndexRatio(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Consonant Protection</span>
                      <span className="font-mono text-white">{consonantProtection.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={consonantProtection}
                      onChange={(e) => setConsonantProtection(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Convert Button */}
          <button
            onClick={handleOpenFilenameModal}
            disabled={!canStart}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 disabled:opacity-30 disabled:cursor-not-allowed rounded-2xl font-black text-sm uppercase tracking-widest cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20"
          >
            {isLoading ? `⏳ ${progressMessage} (${progress}%)` : '🚀 เริ่มแปลงเสียง'}
          </button>

          {/* Progress Bar */}
          {isLoading && (
            <div className="space-y-2">
              <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 text-center">{progressMessage}</p>
            </div>
          )}
        </div>

        {/* Right Column - Result */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            
            {/* Info Card */}
            {!outputFile && !isLoading && (
              <div className="p-6 bg-slate-900/40 rounded-2xl border border-white/5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>💡</span> วิธีใช้
                </h3>
                <div className="space-y-3 text-xs text-slate-400">
                  <div className="flex gap-2">
                    <span className="text-indigo-400 font-bold">1.</span>
                    <span>เลือกโมเดล AI ที่ต้องการใช้แปลงเสียง</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-purple-400 font-bold">2.</span>
                    <span>เลือกไฟล์เสียงร้องต้นฉบับ (แนะนำ: แยกเสียงดนตรีออกแล้ว)</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-emerald-400 font-bold">3.</span>
                    <span>ปรับ Pitch ถ้าต้องการเปลี่ยนคีย์</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-amber-400 font-bold">4.</span>
                    <span>กดปุ่ม "เริ่มแปลงเสียง" และตั้งชื่อไฟล์</span>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="p-6 bg-indigo-950/20 rounded-2xl border border-indigo-500/30 space-y-4">
                <div className="text-center">
                  <div className="text-4xl mb-3 animate-bounce">🎵</div>
                  <p className="text-sm font-bold text-white">กำลังแปลงเสียง...</p>
                  <p className="text-xs text-slate-400 mt-1">กรุณารอสักครู่</p>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-center text-xs text-slate-400">{progress}%</p>
              </div>
            )}

            {/* Result */}
            {outputFile && (
              <div className="p-6 bg-emerald-950/20 rounded-2xl border border-emerald-500/30 space-y-4 animate-fadeIn">
                <div className="text-center">
                  <div className="text-4xl mb-2">✨</div>
                  <p className="text-sm font-bold text-emerald-400 uppercase">สำเร็จ!</p>
                  <p className="text-xs text-slate-400 mt-1 truncate" title={outputFile.name}>
                    {outputFile.name}
                  </p>
                </div>
                <div className="p-3 bg-slate-950/50 rounded-xl border border-white/5">
                  <audio src={outputFile.path} controls autoPlay className="w-full h-10 accent-emerald-500" />
                </div>
                <button
                  onClick={() => {
                    setOutputFile(null);
                    setAudioFile(null);
                    setProgress(0);
                  }}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-all"
                >
                  🔄 แปลงไฟล์ใหม่
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filename Modal */}
      {showFilenameModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-black text-white">ตั้งชื่อไฟล์</h2>
              <p className="text-slate-400 text-xs mt-1">ตั้งชื่อไฟล์ผลลัพธ์ AI Cover</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-indigo-400 uppercase">ชื่อไฟล์</label>
              <div className="relative flex items-center bg-slate-950 rounded-xl border border-white/10 focus-within:border-indigo-500 p-1">
                <input
                  type="text"
                  autoFocus
                  className="w-full bg-transparent text-white rounded-xl p-2.5 text-sm outline-none"
                  placeholder="ระบุชื่อไฟล์..."
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRunInference()}
                />
                <span className="text-xs font-mono font-bold text-slate-500 pr-3">
                  .{outputFormat === 'wav' ? 'wav' : 'mp3'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowFilenameModal(false)}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs uppercase cursor-pointer transition-all"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleRunInference}
                disabled={!customFilename.trim()}
                className="py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 disabled:opacity-30 text-white font-bold rounded-xl text-xs uppercase cursor-pointer transition-all"
              >
                🚀 เริ่มแปลง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Step Indicator Component
const StepIndicator = ({ num, label, done, active }: { num: number; label: string; done: boolean; active: boolean }) => (
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

// Toggle Switch Component
const ToggleSwitch = ({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: () => void }) => (
  <div className="flex items-center justify-between p-2.5 bg-slate-950/50 rounded-lg border border-white/5">
    <div>
      <p className="text-[11px] font-bold text-white">{label}</p>
      <p className="text-[9px] text-slate-500">{desc}</p>
    </div>
    <button
      onClick={onChange}
      className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-all ${
        checked ? 'bg-indigo-600 justify-end' : 'bg-slate-800 justify-start'
      }`}
    >
      <span className="bg-white w-4 h-4 rounded-full shadow-md" />
    </button>
  </div>
);