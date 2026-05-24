import gc
import hashlib
import json
import logging
import os
import re
import shutil
import sys
import threading
import time
import traceback
from shutil import which
from typing import Optional

import numpy as np
import torch
from pydub import AudioSegment
from scipy.io import wavfile

# =====================================================================
# 🎯 [ROBUST PATH FIX]: ป้องกัน ModuleNotFoundError บน Windows
# =====================================================================
_current_file = os.path.abspath(__file__)
_current_dir = os.path.dirname(_current_file)          # .../python/inference
_python_root = os.path.dirname(_current_dir)           # .../python
_lib_root = os.path.join(_python_root, "lib")          # .../python/lib

_paths_to_inject = [
    _python_root,
    _current_dir,
    _lib_root,
    os.path.join(_current_dir, "lib"),
]

for _p in _paths_to_inject:
    if os.path.exists(_p) and _p not in sys.path:
        sys.path.insert(0, _p)
# =====================================================================

from inference.api_models import CreateSongOptions, JobProgressResp, STATUS
from inference.args import parse_args
from inference.utils import find_pth_and_index_files, load_audio
import librosa

logger = logging.getLogger(__name__)


class InferenceManager:
    def set_track_values(self, track_on_disk):
        self.source_audio_path = track_on_disk
        self.track_name = os.path.splitext(os.path.basename(self.source_audio_path))[0]
        if self.sample_mode_30s:
            logger.info("Sample mode: Trimming audio to 30s")
            sample_rate = 44100
            audio_data: np.ndarray = load_audio(self.source_audio_path, sample_rate)
            start = sample_rate * (self.sample_mode_start_time or 0)
            end = start + (sample_rate * 30)
            audio_data = audio_data[start:end]
            self.track_md5 = hashlib.md5(audio_data.tobytes()).hexdigest()
            sample_file = os.path.join(
                self.originals_directory,
                f"sample_{self.track_md5}.wav",
            )
            wavfile.write(sample_file, sample_rate, audio_data)
            self.source_audio_path = sample_file

        hasher = hashlib.md5()
        with open(self.source_audio_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hasher.update(chunk)
        self.track_md5 = hasher.hexdigest()
        
        os.makedirs(self.originals_directory, exist_ok=True)
        
        extension = os.path.splitext(self.source_audio_path)[1]
        self.originals_file = os.path.join(
            self.originals_directory,
            f"{self.track_md5}{extension}",
        )
        if not os.path.exists(self.originals_file):
            shutil.copyfile(self.source_audio_path, self.originals_file)
        self.source_audio_path = self.originals_file

    def __init__(
        self,
        model_name,
        models_path,
        weights_path,
        source_audio_path,
        output_directory,
        options: CreateSongOptions = None,
        job_id: str = None,
        set_status=None,
        check_stop_job=None,
    ):
        self.track_md5: Optional[str] = None
        self.track_name: Optional[str] = None
        self.source_audio_path: str = source_audio_path
        self.last_progress_resp: Optional[JobProgressResp] = None
        self.status: STATUS = "processing"
        
        # 🎯 [GO BRIDGE]: ใช้ JSON stdout printer ถ้าไม่มี callback ส่งมา
        self.set_status = set_status if set_status else self._default_json_status_printer
        self.check_stop_job = check_stop_job if check_stop_job else lambda: False
        self.run_thread: Optional[threading.Thread] = None
        
        # ตัวแปรสำหรับจัดการไฟล์เสียง
        self.instrumentals_file: Optional[str] = None
        self.vocals_file: Optional[str] = None
        self.pre_deecho_vocals_file: Optional[str] = None
        self.converted_vocals_file = None
        self.garbage_files = [] # รายการไฟล์ขยะที่จะถูกล้างทิ้งตอนจบ
        
        self.model = None
        self.job_id = job_id
        self.originals_file = None
        self.joined_track = None

        # รองรับฟีเจอร์ตั้งชื่อไฟล์ผ่าน Popup จาก Frontend
        self.output_name = "converted_vocals"
        if options and hasattr(options, 'outputName') and options.outputName:
            self.output_name = options.outputName
        elif job_id:
            try:
                import tempfile
                temp_config_path = os.path.join(tempfile.gettempdir(), f"job_{job_id}.json")
                if os.path.exists(temp_config_path):
                    with open(temp_config_path, "r", encoding="utf-8") as f:
                        raw_data = json.load(f)
                        raw_opts = raw_data.get("options", {})
                        if isinstance(raw_opts, dict) and raw_opts.get("outputName"):
                            self.output_name = raw_opts.get("outputName")
            except Exception:
                pass

        options = options or CreateSongOptions()
        pre_stemmed = options is not None and options.preStemmed
        sample_mode_30s = options is not None and options.sampleMode
        sample_mode_start_time = options is not None and options.sampleModeStartTime or 0
        pitch = options is not None and options.pitch
        instrumentals_pitch = options is not None and options.instrumentalsPitch
        vocals_only = options is not None and options.vocalsOnly
        stemming_method = options is not None and options.stemmingMethod

        self.f0_method = options is not None and options.f0Method or "rmvpe"
        self.output_format = options is not None and options.outputFormat or "mp3_320k"
        self.options = options
        self.pitch: Optional[int] = pitch
        self.vocals_only = vocals_only
        self.stemming_model = stemming_method
        self.pre_stemmed = pre_stemmed
        self.sample_mode_30s = sample_mode_30s
        self.sample_mode_start_time = sample_mode_start_time
        self.instrumentals_pitch = instrumentals_pitch
        self.model_name = model_name
        self.models_path = models_path
        self.weights_path = weights_path
        self.output_directory = os.path.join(output_directory, job_id) if job_id else output_directory
        
        os.makedirs(self.output_directory, exist_ok=True)
        self.stems_directory = os.path.join(self.output_directory, "stems")
        self.yt_cache = os.path.join(self.output_directory, "yt-cache")
        self.originals_directory = os.path.join(self.output_directory, "originals")

        # 🧹 ระบบเคลียร์แคชก่อนเริ่มงาน (ล้างไฟล์เก่าทิ้ง ป้องกันบั๊กทับซ้อน)
        self.clear_old_cache_before_start()

        if source_audio_path and os.path.exists(source_audio_path):
            self.set_track_values(source_audio_path)

        logger.info(f"Model name: {self.model_name}")
        logger.info(f"Models path: {self.models_path}")
        logger.info(f"Weights path: {self.weights_path}")
        logger.info(f"Stemming method: {self.stemming_model}")
        logger.info(f"F0 method: {self.f0_method}")
        logger.info(f"Output path: {self.output_directory}")

        self.elapsed_seconds = None
        self.error: Optional[Exception] = None
        self.remaining_seconds = None
        self.output_filepath = None

    # =====================================================================
    # 🎯 JSON Status Printer - สำหรับ Go bridge ดักจับ stdout
    # =====================================================================
    def _default_json_status_printer(self, status: JobProgressResp):
        """พิมพ์ JSON progress ออก stdout ให้ Go ดักจับแบบ real-time"""
        try:
            if hasattr(status, 'model_dump'):
                data = status.model_dump()
            elif hasattr(status, 'dict'):
                data = status.dict()
            else:
                data = status.__dict__
            json_line = json.dumps(data, ensure_ascii=False, default=str)
            print(f"PROGRESS_JSON:{json_line}", flush=True)
        except Exception as e:
            logger.error(f"Failed to serialize status: {e}")
            logger.info(f"Status: {getattr(status, 'message', 'unknown')}")

    def clear_old_cache_before_start(self):
        """ ล้างโฟลเดอร์ Stems เก่าทิ้ง สร้างใหม่เพื่อความสะอาดก่อนรัน """
        try:
            if os.path.exists(self.stems_directory):
                shutil.rmtree(self.stems_directory, ignore_errors=True)
            os.makedirs(self.stems_directory, exist_ok=True)
        except Exception as e:
            logger.warning(f"Could not clear old stems cache: {e}")

    def clear_garbage_cache(self):
        """ ล้างไฟล์ขยะระหว่างทางเพื่อคืนพื้นที่ว่างหลังแปลงไฟล์เสร็จ """
        logger.info("🧹 Clearing intermediate garbage cache files...")
        for filepath in self.garbage_files:
            if filepath and os.path.exists(filepath):
                try:
                    os.remove(filepath)
                except Exception as e:
                    logger.debug(f"Failed to remove cache file {filepath}: {e}")
        
        # ลบโฟลเดอร์ก๊อปปี้ตอนล้างเสียงสะท้อน
        copies_dir = os.path.join(self.stems_directory, "vocals_copies")
        if os.path.exists(copies_dir):
            shutil.rmtree(copies_dir, ignore_errors=True)

    def _sync_global_hardware(self):
        """ ระบบล็อกและสลับอุปกรณ์ประมวลผล (CPU/GPU) """
        from inference.config import config

        target_device = None
        if hasattr(self, 'options') and self.options:
            if hasattr(self.options, 'device') and self.options.device:
                target_device = str(self.options.device).strip().lower()
            elif hasattr(self.options, 'gpu'):
                target_device = "cuda" if self.options.gpu else "cpu"

        # 🎯 [GO BRIDGE]: อ่านจาก environment variable (ที่ Go set ไว้)
        if not target_device:
            env_device = os.environ.get("PYTORCH_DEVICE", "")
            if env_device:
                target_device = env_device.strip().lower()

        if not target_device:
            try:
                base_dir = os.path.dirname(os.path.abspath(__file__))
                settings_path = os.path.abspath(os.path.join(base_dir, "..", "data", "settings.json"))
                if not os.path.exists(settings_path):
                    settings_path = os.path.abspath(os.path.join(base_dir, "data", "settings.json"))
                
                if os.path.exists(settings_path):
                    with open(settings_path, "r", encoding="utf-8") as f:
                        settings = json.load(f)
                        settings_device = settings.get("device")
                        if settings_device:
                            target_device = str(settings_device).strip().lower()
            except Exception as e:
                logger.warning(f"[Hardware Sync] Cannot read settings.json dynamically: {e}")

        if not target_device:
            target_device = "cpu"

        if ("cuda" in target_device or "gpu" in target_device) and torch.cuda.is_available():
            config.device = "cuda"
            config.is_half = True
            if "CUDAExecutionProvider" not in getattr(config, 'ort_providers', []):
                config.ort_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            logger.info("[Hardware Sync] Dynamic global switch: LOCKED to GPU (CUDA) for all tasks.")
        elif "mps" in target_device and hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            config.device = "mps"
            config.is_half = False
            if "CoreMLExecutionProvider" not in getattr(config, 'ort_providers', []):
                config.ort_providers = ["CoreMLExecutionProvider", "CPUExecutionProvider"]
            logger.info("[Hardware Sync] Dynamic global switch: LOCKED to Apple Silicon (MPS) for all tasks.")
        else:
            config.device = "cpu"
            config.is_half = False
            config.ort_providers = ["CPUExecutionProvider"]
            logger.info("[Hardware Sync] Dynamic global switch: LOCKED to CPU for all tasks.")

    def find_model(self, models_path: str, model_name: str):
        from inference.rvc_model import RVCModel

        model_dir = os.path.join(models_path, model_name)
        if not os.path.exists(model_dir) and not model_name.lower().endswith(".pth"):
            fallback_dir = os.path.join(models_path, f"{model_name}.pth")
            if os.path.exists(fallback_dir):
                model_dir = fallback_dir

        pth_files, index_files = find_pth_and_index_files(model_dir)
        model = RVCModel(model_name, pth_files, index_files)
        return model

    def load_model(self):
        self.model = self.find_model(self.models_path, self.model_name)
        if self.model is None:
            runtime_error = RuntimeError(f"Unable to load model {self.model_name}")
            self.error = runtime_error
            raise runtime_error
        logger.info("---------------------------------")

    def stem_and_load_input_track(self):
        from inference.stemmer import Stemmer

        self.check_and_update_status("UVR: Starting track separation...")
        if self.pre_stemmed:
            logger.info("UVR: Pre-stemmed track detected. Skipping separation.")
            self.vocals_file = self.source_audio_path
        else:
            start_time = time.time()

            def update_status(msg):
                self.check_and_update_status(f"Separating track... {msg}")

            from inference.config import config
            target_device = config.device

            base_model = self.stemming_model
            if base_model == "Absolute_Lead_Isolation":
                base_model = "UVR-MDX-NET Voc FT"

            # 🚀 Passที่ 1: แยกไฟล์ดนตรีและเสียงร้อง (ดนตรีออกมาก่อน)
            self.instrumentals_file, self.vocals_file = Stemmer.separate_track(
                self.source_audio_path,
                self.stems_directory,
                self.weights_path,
                base_model,
                update_status,
                device=target_device,
            )
            
            # 🚀 Passที่ 2: ล้างเสียงสะท้อน (De-Echo / De-Reverb)
            if self.options.deEchoDeReverb:
                self.check_and_update_status("De-Echoing input file...")
                
                hasher_vocals = hashlib.md5()
                with open(self.vocals_file, "rb") as f:
                    for chunk in iter(lambda: f.read(65536), b""):
                        hasher_vocals.update(chunk)
                md5_vocals = hasher_vocals.hexdigest()

                vocal_copies_dir = os.path.join(self.stems_directory, "vocals_copies")
                os.makedirs(vocal_copies_dir, exist_ok=True)
                md5_vocals_file = os.path.join(vocal_copies_dir, f"{md5_vocals}.wav")
                if not os.path.exists(md5_vocals_file):
                    shutil.copyfile(self.vocals_file, md5_vocals_file)
                self.pre_deecho_vocals_file = self.vocals_file

                def update_status_deecho(msg):
                    self.check_and_update_status(f"De-echoing track... {msg}")

                # เสียงเอคโค่ส่วนเกิน (สลัดออก), เสียงร้องหลักที่ผ่านการคลีน
                echo_and_reverb_file, self.vocals_file = Stemmer.separate_track(
                    md5_vocals_file,
                    self.stems_directory,
                    self.weights_path,
                    "UVR-DeEcho-DeReverb by FoxJoy",
                    update_status_deecho,
                    device=target_device,
                )
                self.garbage_files.append(echo_and_reverb_file) # เก็บลงถังขยะ

            # 🚀 Passที่ 3: ลบเศษดนตรีหลุดรอดด้วย Kim_Vocal_1 ตามลำดับที่ระบุ [self.vocals_file, instrumental_bleed]
            self.check_and_update_status("Purifying Vocals (Removing Instrumental Bleeding)...")
            def update_status_clean(msg):
                self.check_and_update_status(f"Cleaning Instruments Bleed... {msg}")
            
            self.vocals_file, instrumental_bleed = Stemmer.separate_track(
                self.vocals_file,
                self.stems_directory,
                self.weights_path,
                "Kim_Vocal_1",
                update_status_clean,
                device=target_device,
            )
            self.garbage_files.append(instrumental_bleed) # เก็บลงถังขยะ

            # 🚀 Passที่ 4: สลัดเสียงร้องคอรัส แบ็คกิ้งโวคอล ด้วย Karaoke 2
            self.check_and_update_status("Isolating Lead Vocals (Removing Backing Vocals & Harmonies)...")
            def update_status_karaoke(msg):
                self.check_and_update_status(f"Isolating Main Lead Singer... {msg}")

            backing_vocals_file, self.vocals_file = Stemmer.separate_track(
                self.vocals_file,
                self.stems_directory,
                self.weights_path,
                "UVR-MDX-NET Karaoke 2",
                update_status_karaoke,
                device=target_device,
            )
            self.garbage_files.append(backing_vocals_file) # เก็บลงถังขยะ

            # 🚀 Passที่ 5: คัดเสียงร้องนำเดี่ยวขั้นเด็ดขาดด้วย UVR-MDX-NET Main
            self.check_and_update_status("Isolating Absolute Single Lead Singer...")
            def update_status_main(msg):
                self.check_and_update_status(f"Purifying Single Vocalist... {msg}")

            secondary_vocal_bleed, self.vocals_file = Stemmer.separate_track(
                self.vocals_file,
                self.stems_directory,
                self.weights_path,
                "UVR-MDX-NET Main",
                update_status_main,
                device=target_device,
            )
            self.garbage_files.append(secondary_vocal_bleed) # เก็บลงถังขยะ
            self.garbage_files.append(self.vocals_file) # ไฟล์ร้องดิบใช้เสร็จแล้วเตรียมทิ้งตอนจบ

            elapsed_time = time.time() - start_time
            logger.info(f"Advanced Single Vocalist Purification complete. Total elapsed time: {elapsed_time}")

        logger.info("UVR: Track separation complete.")
        logger.info("---------------------------------")

    def pitch_shift(self, audio: AudioSegment, pitch: int):
        is_stereo = audio.channels == 2
        if is_stereo:
            audio_channels = audio.split_to_mono()
        else:
            audio_channels = [audio]

        shifted_channels = []
        for channel in audio_channels:
            samples = np.array(channel.get_array_of_samples())
            samples_float = samples.astype(np.float32) / np.iinfo(samples.dtype).max

            y_shifted = librosa.effects.pitch_shift(samples_float, sr=audio.frame_rate, n_steps=float(pitch))

            int_samples = np.array(y_shifted * np.iinfo(samples.dtype).max, dtype=samples.dtype)

            shifted_channel = AudioSegment(
                int_samples.tobytes(),
                frame_rate=audio.frame_rate,
                sample_width=audio.sample_width,
                channels=1,
            )
            shifted_channels.append(shifted_channel)

        if is_stereo:
            shifted_audio = AudioSegment.from_mono_audiosegments(*shifted_channels)
        else:
            shifted_audio = shifted_channels[0]

        return shifted_audio

    def perform_inference(self):
        try:
            self.check_and_update_status("Starting inference...")
            tgt_sr, audio_opt = self.model.run_inference(
                self.vocals_file,
                self.weights_path,
                self.check_and_update_status,
                self.options,
            )
            self.check_and_update_status("Creating audio files...")
            
            ext = ".wav" if self.output_format == "wav" else ".mp3"
            output_file = f"{self.output_name}{ext}"
            
            parameters = {"format": "wav"}
            if self.output_format == "mp3_192k":
                parameters = {"format": "mp3", "bitrate": "192k"}
            elif self.output_format == "mp3_320k":
                parameters = {"format": "mp3", "bitrate": "320k"}
                
            joined_track_export = os.path.join(self.output_directory, output_file)
            self.output_filepath = joined_track_export
            self.converted_vocals_file = joined_track_export

            temp_wav_path = os.path.join(self.output_directory, "temp_inference_vocal.wav")
            
            audio_opt = np.nan_to_num(np.array(audio_opt, dtype=np.float32))

            peak_limit = np.percentile(np.abs(audio_opt), 99.9)
            if peak_limit > 0:
                audio_opt = np.clip(audio_opt, -peak_limit, peak_limit)
                
            max_v = np.max(np.abs(audio_opt))
            if max_v > 0:
                if max_v <= 1.01:
                    audio_opt = (audio_opt * 32767).astype(np.int16)
                else:
                    audio_opt = (audio_opt / max_v * 32767).astype(np.int16)
            else:
                audio_opt = audio_opt.astype(np.int16)
                
            logger.info(f"RVCv2: Inference succeeded. Writing temporary wav...")
            wavfile.write(temp_wav_path, tgt_sr, audio_opt)
            logger.info("---------------------------------")
            
            logger.info("Loading converted vocal track...")
            vocal = AudioSegment.from_wav(temp_wav_path)
            
            # 🚀 มิกซ์รวมเสียง: โหลดดนตรีเป็นฐานล่าง แล้วเอาเสียงร้อง (vocal) โปะทับไว้ด้านบนด้วย overlay
            if not self.vocals_only and self.instrumentals_file and os.path.exists(self.instrumentals_file):
                logger.info("Mixing converted vocals on top of original instrumentals...")
                instrumental = AudioSegment.from_file(self.instrumentals_file)
                
                if self.instrumentals_pitch:
                    instrumental = self.pitch_shift(instrumental, self.instrumentals_pitch)
                
                # โค้ดนี้ทำให้เสียงร้องอยู่บน เสียงดนตรีอยู่ล่าง (Background=Instrumental, Foreground=Vocal)
                self.joined_track = instrumental.overlay(vocal)
            else:
                logger.info("Vocals only mode selected. Exporting vocals without instrumentals.")
                self.joined_track = vocal

            logger.info("Writing completed file...")
            self.joined_track.export(joined_track_export, **parameters)
            
            if os.path.exists(temp_wav_path):
                os.remove(temp_wav_path)
                
            logger.info(f"Track successfully written to: {joined_track_export}")
            logger.info("---------------------------------")
            logger.info("Inference complete.")
            
            # ปล่อยแรม
            self.model.clearMemory()
            del self.model
            del audio_opt
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()

        except Exception as e:
            if self.status == "stopped":
                self.check_and_update_status("Stopped")
                return
            self.error = e
            self.status = "errored"
            self.check_and_update_status(f"Error: {e}", "errored")
            traceback.print_exc()
            raise e

    def check_and_update_status(self, status_message, status: STATUS = None):
        self.status = status if status else self.status
        if self.check_stop_job() and self.status != "stopped":
            self.status = "stopped"
            raise RuntimeError("Stopped")
        logger.info(f"Status ({self.status}): {status_message}")
        error_str = None
        if self.error:
            error_str = str(self.error)
        progress_resp = JobProgressResp(
            status=self.status,
            message=status_message,
            error=error_str,
            elapsedSeconds=self.elapsed_seconds,
            remainingSeconds=self.remaining_seconds,
            outputFilepath=self.output_filepath,
            inputFilepath=self.source_audio_path,
            preDeechoVocalsFile=self.pre_deecho_vocals_file,
            originalVocalsPath=self.vocals_file,
            convertedVocalsPath=self.converted_vocals_file,
            instrumentalsPath=self.instrumentals_file,
            options=self.options,
            modelId=self.model_name,
            songHash=self.track_md5,
            trackName=self.track_name,
            jobId=self.job_id,  # 🎯 [GO BRIDGE]: เพิ่ม jobId สำหรับ Go bridge
        )
        self.set_status(progress_resp)
        self.last_progress_resp = progress_resp

    def check_deps(self):
        ffmpeg_bin = which("ffmpeg")
        if not ffmpeg_bin:
            self.status = "errored"
            runtime_error = RuntimeError("ffmpeg not found")
            self.error = runtime_error
            raise runtime_error

    def set_source_audio_path(self):
        if not os.path.exists(self.source_audio_path):
            raise RuntimeError(f"Source audio file not found: {self.source_audio_path}")
        self.set_track_values(self.source_audio_path)

    def create_preview_tracks(self):
        pass

    def infer(self):
        start_time = time.time()
        try:
            self._sync_global_hardware()

            self.check_and_update_status("Starting up...", "processing")
            self.check_deps()
            self.check_and_update_status("Dependencies checked")
            self.set_source_audio_path()
            if self.vocals_only:
                self.check_and_update_status("Skipping inference due to vocalsOnly option")
                self.stem_and_load_input_track()
                self.output_filepath = self.vocals_file
                return
            self.check_and_update_status("Loading model...")
            self.load_model()
            self.check_and_update_status("Separating track...")
            self.stem_and_load_input_track()

            self.check_and_update_status("Performing inference...")
            self.perform_inference()
            
            if self.status != "stopped":
                self.check_and_update_status("Completed", "completed")
                
        except RuntimeError as e:
            traceback.print_exc()
            self.error = e
            if self.status == "stopped":
                self.check_and_update_status("Stopped", "stopped")
                return
            self.check_and_update_status("Error", "errored")
        except Exception as e:
            if self.status == "stopped":
                return
            self.error = e
            self.check_and_update_status("Error", "errored")
            traceback.print_exc()
        finally:
            # ล้างไฟล์ขยะที่ไม่จำเป็นออกเมื่อเสร็จสิ้นการประมวลผล เพื่อคืนพื้นที่ให้ผู้ใช้
            self.clear_garbage_cache()
            
            if self.status == "processing":
                self.check_and_update_status("Completed", "completed")
            elapsed_time = time.time() - start_time
            logger.info(f"Total elapsed time: {elapsed_time}")


# =====================================================================
# 🎯 Entry Points
# =====================================================================
def main_from_config():
    """Run inference from JSON config file (called by Go subprocess)"""
    if len(sys.argv) < 3 or sys.argv[1] != "--config":
        print(
            "Usage: python -m inference.inference_manager --config <config.json>",
            file=sys.stderr,
        )
        sys.exit(1)

    config_path = sys.argv[2]
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        print(f"Failed to load config file {config_path}: {e}", file=sys.stderr)
        sys.exit(1)

    # Parse options
    opts_dict = config.get("options") or {}
    try:
        options = CreateSongOptions(**opts_dict)
    except Exception as e:
        logger.warning(f"Failed to parse options with Pydantic: {e}. Using dict fallback.")
        options = opts_dict

    # Multi-key fallback สำหรับ fields หลัก
    audio_path = (
        config.get("source_audio_path")
        or config.get("sourceAudioPath")
        or config.get("songUrlOrFilePath")
    )
    model_name = (
        config.get("model_name")
        or config.get("modelName")
        or config.get("modelId")
    )
    models_path = config.get("models_path") or config.get("modelsPath")
    weights_path = config.get("weights_path") or config.get("weightsPath")
    output_dir = config.get("output_directory") or config.get("outputDirectory")

    manager = InferenceManager(
        model_name=model_name or "",
        models_path=models_path or "",
        weights_path=weights_path or "",
        source_audio_path=audio_path or "",
        output_directory=output_dir or "",
        options=options,
        job_id=config.get("job_id", ""),
    )

    manager.infer()


def main():
    args = parse_args()
    inference_manager = InferenceManager(
        args.model_name,
        args.model_dir,
        args.weights_dir,
        args.source_audio_path,
        args.out_dir,
    )
    inference_manager.infer()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--config":
        main_from_config()
    else:
        main()