import gc
import hashlib
import logging
import os
import re
import shutil
import threading
import time
import traceback
from shutil import which
from typing import Optional

import numpy as np
import torch
from pydub import AudioSegment
from scipy.io import wavfile

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
        self.set_status = set_status if set_status else lambda x: logger.info(x)
        self.check_stop_job = check_stop_job if check_stop_job else lambda: False
        self.run_thread: Optional[threading.Thread] = None
        self.instrumentals_file: Optional[str] = None
        self.vocals_file: Optional[str] = None
        self.pre_deecho_vocals_file: Optional[str] = None
        self.converted_vocals_file = None
        self.model = None
        self.job_id = job_id
        self.originals_file = None
        self.joined_track = None

        # 🎯 [ระบบสกัดชื่อไฟล์แบบไดนามิก]: ดักจับค่าชื่อไฟล์ที่ส่งมาจากออปชันหน้าบ้าน
        self.output_name = "converted_vocals"
        if options and hasattr(options, 'outputName') and options.outputName:
            self.output_name = options.outputName
        elif job_id:
            try:
                import tempfile
                import json
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
        self.output_directory = os.path.join(output_directory, job_id)
        
        os.makedirs(self.output_directory, exist_ok=True)
        self.stems_directory = os.path.join(output_directory, "stems")
        self.yt_cache = os.path.join(output_directory, "yt-cache")

        self.originals_directory = os.path.join(output_directory, "originals")
        if os.path.exists(source_audio_path):
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

            self.vocals_file, self.instrumentals_file = Stemmer.separate_track(
                self.source_audio_path,
                self.stems_directory,
                self.weights_path,
                self.stemming_model,
                update_status,
            )
            elapsed_time = time.time() - start_time
            logger.info(f"UVR: Separation complete. Elapsed time: {elapsed_time}")
            
            # 🎯 [Advanced 2-Pass Sequential UVR]: ล้างเสียงก้องห้องและสลัดเสียงคอรัสประสาน/ฮัมเพลงเมื่อเปิด De-Echo
            if self.options.deEchoDeReverb:
                self.check_and_update_status("De-Echoing input file...")
                
                hasher_vocals = hashlib.md5()
                with open(self.vocals_file, "rb") as f:
                    for chunk in iter(lambda: f.read(65536), b""):
                        hasher_vocals.update(chunk)
                md5_vocals = hasher_vocals.hexdigest()

                vocal_copies_dir = os.path.join(
                    self.stems_directory,
                    "vocals_copies",
                )
                os.makedirs(vocal_copies_dir, exist_ok=True)
                md5_vocals_file = os.path.join(
                    vocal_copies_dir,
                    f"{md5_vocals}.wav",
                )
                if not os.path.exists(md5_vocals_file):
                    shutil.copyfile(self.vocals_file, md5_vocals_file)
                self.pre_deecho_vocals_file = self.vocals_file

                def update_status_deecho(msg):
                    self.check_and_update_status(f"De-echoing track... {msg}")

                # 🚀 Pass ที่ 1: ล้างเสียงสะท้อน (Room Reverb Clean) ผ่าน FoxJoy
                self.vocals_file, echo_and_reverb_file = Stemmer.separate_track(
                    md5_vocals_file,
                    self.stems_directory,
                    self.weights_path,
                    "UVR-DeEcho-DeReverb by FoxJoy",
                    update_status_deecho,
                )
                
                # 🚀 Pass ที่ 2: ลบเสียงร้องคอรัส เสียงซ้อน และเสียงฮัมเพลงออกด้วย Kim_Vocal_1
                self.check_and_update_status("Purifying Lead Vocals (Removing Harmonies, Overlaps & Humming)...")
                
                def update_status_purify(msg):
                    self.check_and_update_status(f"Purifying Vocals... {msg}")
                
                self.vocals_file, backing_vocals_file = Stemmer.separate_track(
                    self.vocals_file,
                    self.stems_directory,
                    self.weights_path,
                    "Kim_Vocal_1", 
                    update_status_purify,
                )

                elapsed_time = time.time() - start_time
                logger.info(f"Advanced Vocal Purification complete. Total elapsed time: {elapsed_time}")

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
            
            # 🎯 [แก้ไขชื่อไฟล์ผลลัพธ์แบบไดนามิก]: ประกอบชื่อไฟล์ปลายทางตามค่าของ self.output_name
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
            
            logger.info("Exporting completed vocal track...")
            vocal = AudioSegment.from_wav(temp_wav_path)
            self.joined_track = vocal

            logger.info("Writing completed file...")
            self.joined_track.export(joined_track_export, **parameters)
            
            if os.path.exists(temp_wav_path):
                os.remove(temp_wav_path)
                
            logger.info(f"Track successfully written to: {joined_track_export}")
            logger.info("---------------------------------")
            logger.info("Inference complete.")
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
            if self.status == "processing":
                self.check_and_update_status("Completed", "completed")
            elapsed_time = time.time() - start_time
            logger.info(f"Total elapsed time: {elapsed_time}")


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
    main()