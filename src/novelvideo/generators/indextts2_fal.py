"""IndexTTS2 client for Seedance 2.0 dialogue audio preparation."""

from __future__ import annotations

import hashlib
import io
import os
import subprocess
import tempfile
import time
import uuid
import wave
from pathlib import Path
from typing import Any

import httpx

from novelvideo.ports import get_usage_meter
from novelvideo.shared.billing_errors import is_insufficient_credits_error
from novelvideo.generators.tts_generator import TTSResult


MIN_COSYVOICE_REFERENCE_SECONDS = 3.0


async def _reserve_tts_model_call(model: str, *, source: str) -> str:
    return await get_usage_meter().reserve_current_model_call_credit(
        model=model,
        billing_kind="audio",
        metadata={"source": source},
    )


async def _refund_tts_model_call(
    reservation_id: str,
    *,
    source: str,
    error: str,
    provider_request_id: str = "",
) -> None:
    if not reservation_id:
        return
    try:
        metadata: dict[str, Any] = {"source": source, "error": error[:200]}
        if provider_request_id:
            metadata["request_id"] = provider_request_id
        await get_usage_meter().refund_model_call_credit_reservation(
            reservation_id,
            metadata=metadata,
        )
    except Exception:
        pass


async def _confirm_tts_model_call(
    *,
    model: str,
    reservation_id: str,
    provider_request_id: str = "",
    response_id: str = "",
) -> None:
    try:
        await get_usage_meter().bump_model_call(
            user_id=None,
            model=model,
            provider_request_id=provider_request_id,
            credit_reservation_id=reservation_id,
            metadata={"response_id": response_id} if response_id else None,
        )
    except Exception:
        pass


def _extract_audio_url(payload: dict[str, Any]) -> str:
    audio = payload.get("audio")
    if isinstance(audio, str):
        return audio.strip()
    if isinstance(audio, dict):
        return str(audio.get("url") or "").strip()
    return ""


async def _audio_duration_seconds(audio_path: Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


class IndexTTS2FalClient:
    """Beat audio client supporting IndexTTS2 and CosyVoice voice cloning.

    ``INDEXTTS2_PROVIDER=newapi`` routes through NewAPI's OpenAI audio endpoint;
    ``INDEXTTS2_PROVIDER=fal`` uses fal.ai direct;
    ``INDEXTTS2_PROVIDER=cosyvoice`` uses DashScope CosyVoice voice cloning.
    """

    # Shared cache of enrolled CosyVoice voice IDs keyed by reference audio hash.
    _cosyvoice_voice_cache: dict[str, str] = {}

    def __init__(
        self,
        *,
        provider: str | None = None,
        api_key: str | None = None,
        endpoint: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
    ):
        from novelvideo.config import (
            COSYVOICE_BEAT_MODEL,
            COSYVOICE_BEAT_VOICE_ID,
            DASHSCOPE_API_KEY,
            FAL_API_KEY,
            INDEXTTS2_FAL_ENDPOINT,
            INDEXTTS2_NEWAPI_MODEL,
            INDEXTTS2_PROVIDER,
            INDEXTTS2_TIMEOUT_SECONDS,
            get_effective_newapi_gateway_config,
        )

        self.provider = (provider if provider is not None else INDEXTTS2_PROVIDER).strip().lower()
        if self.provider not in {"newapi", "fal", "cosyvoice"}:
            self.provider = "newapi"
        if self.provider == "newapi":
            gateway = get_effective_newapi_gateway_config()
            self.api_key = api_key if api_key is not None else gateway.api_key
            self.endpoint = endpoint or gateway.base_url
            self.model = model or INDEXTTS2_NEWAPI_MODEL
        elif self.provider == "cosyvoice":
            self.api_key = api_key if api_key is not None else (DASHSCOPE_API_KEY or "")
            self.endpoint = endpoint or ""
            self.model = model or COSYVOICE_BEAT_MODEL
            self._cosyvoice_preset_voice_id = COSYVOICE_BEAT_VOICE_ID
        else:
            self.api_key = (
                api_key if api_key is not None else (FAL_API_KEY or os.getenv("FAL_KEY", ""))
            )
            self.endpoint = endpoint or INDEXTTS2_FAL_ENDPOINT
            self.model = model or "IndexTTS2"
        self.timeout_seconds = float(
            timeout_seconds if timeout_seconds is not None else INDEXTTS2_TIMEOUT_SECONDS
        )
        self._last_provider_request_id = ""
        self._last_provider_response_id = ""
        self._cosyvoice_verified_voice_ids: set[str] = set()
        self._cosyvoice_voice_errors: dict[str, str] = {}

    async def generate(
        self,
        *,
        prompt: str,
        audio_url: str,
        output_path: str | Path,
        emotion_prompt: str = "",
    ) -> TTSResult:
        """Generate dialogue audio from a reference sample and save it to ``output_path``."""
        if not self.api_key:
            if self.provider == "newapi":
                key_name = "DramaClawAPI API key"
            elif self.provider == "cosyvoice":
                key_name = "DASHSCOPE_API_KEY"
            else:
                key_name = "FAL_KEY/FAL_API_KEY"
            return TTSResult(success=False, error=f"{key_name} not set")
        prompt = str(prompt or "").strip()
        if not prompt:
            return TTSResult(success=False, error="IndexTTS2 prompt is empty")
        audio_url = str(audio_url or "").strip()
        if not audio_url:
            return TTSResult(success=False, error="IndexTTS2 audio_url is empty")

        target = Path(output_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        self._last_provider_request_id = ""
        self._last_provider_response_id = ""
        source = f"indextts2_{self.provider}"
        reservation_id = ""
        try:
            reservation_id = await _reserve_tts_model_call(self.model, source=source)
        except Exception as exc:
            if is_insufficient_credits_error(exc):
                raise
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=f"{exc.__class__.__name__}: {detail}")

        if self.provider == "newapi":
            result = await self._generate_via_newapi(
                prompt=prompt,
                audio_url=audio_url,
                output_path=target,
                emotion_prompt=emotion_prompt,
            )
        elif self.provider == "cosyvoice":
            result = await self._generate_via_cosyvoice(
                prompt=prompt,
                audio_url=audio_url,
                output_path=target,
                emotion_prompt=emotion_prompt,
            )
        else:
            result = await self._generate_via_fal(
                prompt=prompt,
                audio_url=audio_url,
                output_path=target,
                emotion_prompt=emotion_prompt,
            )
        if result.success:
            await _confirm_tts_model_call(
                model=self.model,
                reservation_id=reservation_id,
                provider_request_id=self._last_provider_request_id,
                response_id=self._last_provider_response_id,
            )
        else:
            await _refund_tts_model_call(
                reservation_id,
                source=source,
                error=result.error or "tts_generation_failed",
                provider_request_id=self._last_provider_request_id,
            )
        return result

    async def _generate_via_fal(
        self,
        *,
        prompt: str,
        audio_url: str,
        output_path: Path,
        emotion_prompt: str = "",
    ) -> TTSResult:
        body: dict[str, Any] = {
            "audio_url": audio_url,
            "prompt": prompt,
            "should_use_prompt_for_emotion": True,
        }
        if str(emotion_prompt or "").strip():
            body["emotion_prompt"] = str(emotion_prompt).strip()

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    self.endpoint,
                    headers={
                        "Authorization": f"Key {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
                response.raise_for_status()
                result_url = _extract_audio_url(response.json())
                if not result_url:
                    return TTSResult(success=False, error="IndexTTS2 response missing audio URL")

                audio_response = await client.get(result_url)
                audio_response.raise_for_status()
                output_path.write_bytes(audio_response.content)

            if not output_path.exists() or output_path.stat().st_size <= 0:
                return TTSResult(success=False, error="IndexTTS2 audio file was not created")

            return TTSResult(
                success=True,
                audio_path=str(output_path),
                duration_seconds=await _audio_duration_seconds(output_path),
            )
        except Exception as exc:
            if is_insufficient_credits_error(exc):
                raise
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=f"{exc.__class__.__name__}: {detail}")

    async def _generate_via_cosyvoice(
        self,
        *,
        prompt: str,
        audio_url: str,
        output_path: Path,
        emotion_prompt: str = "",
    ) -> TTSResult:
        """Generate audio via DashScope CosyVoice voice cloning.

        Flow:
        1. Resolve a CosyVoice voice ID from the reference audio
           (use pre-configured COSYVOICE_BEAT_VOICE_ID, or enroll a new voice)
        2. Synthesize speech using SpeechSynthesizer with the cloned voice
        """
        try:
            import dashscope
            from dashscope.audio.tts_v2 import SpeechSynthesizer, ResultCallback
            from novelvideo.config import COSYVOICE_BEAT_LANGUAGE
        except ImportError:
            return TTSResult(
                success=False,
                error="dashscope not installed. Run: pip install dashscope",
            )

        dashscope.api_key = self.api_key
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            voice_id = await self._resolve_cosyvoice_voice_id(audio_url)
        except Exception as exc:
            detail = str(exc) or repr(exc)
            if "Audio.AudioShortError" in detail or "valid audio too short" in detail.lower():
                detail = (
                    "参考音频中的有效人声不足 3 秒。请使用 3-30 秒的单人清晰语音，"
                    "并去除开头、结尾和中间的长静音后重试。"
                )
            return TTSResult(success=False, error=f"CosyVoice 声音注册失败: {detail}")

        # --- Step 2: synthesize speech ---
        import threading

        class _FileCallback(ResultCallback):
            def __init__(self, path: Path):
                self.path = path
                self.file = None
                self.error_msg = None
                self.completed = threading.Event()

            def on_open(self):
                self.file = open(self.path, "wb")

            def on_data(self, data: bytes):
                if self.file:
                    self.file.write(data)

            def on_complete(self):
                pass

            def on_error(self, message: str):
                self.error_msg = message

            def on_close(self):
                if self.file:
                    self.file.close()
                self.completed.set()

        temp_path = output_path.with_name(
            f".{output_path.name}.{uuid.uuid4().hex}.tmp"
        )
        callback = _FileCallback(temp_path)
        try:
            synthesizer = SpeechSynthesizer(
                model=self.model,
                voice=voice_id,
                language_hints=[COSYVOICE_BEAT_LANGUAGE],
                callback=callback,
            )
            import asyncio

            loop = asyncio.get_event_loop()
            def _synthesize() -> None:
                if hasattr(synthesizer, "streaming_call") and hasattr(
                    synthesizer, "streaming_complete"
                ):
                    synthesizer.streaming_call(prompt)
                    synthesizer.streaming_complete(120000)
                else:  # pragma: no cover - narrow compatibility fallback for test doubles
                    synthesizer.call(prompt)

            await loop.run_in_executor(None, _synthesize)
            completed = await loop.run_in_executor(
                None, lambda: callback.completed.wait(timeout=120)
            )
            if not completed:
                return TTSResult(
                    success=False,
                    error="CosyVoice 合成超时（120s）",
                )
            if callback.error_msg:
                return TTSResult(success=False, error=f"CosyVoice: {callback.error_msg}")

            if not temp_path.exists() or temp_path.stat().st_size <= 0:
                return TTSResult(success=False, error="CosyVoice 未生成音频文件")

            temp_path.replace(output_path)

            return TTSResult(
                success=True,
                audio_path=str(output_path),
                duration_seconds=await _audio_duration_seconds(output_path),
            )
        except Exception as exc:
            if is_insufficient_credits_error(exc):
                raise
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=f"CosyVoice: {detail}")
        finally:
            if callback.file and not callback.file.closed:
                callback.file.close()
            temp_path.unlink(missing_ok=True)

    # ------------------------------------------------------------------
    # CosyVoice helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _cosyvoice_audio_cache_key(audio_url: str) -> str:
        return hashlib.sha256(audio_url.encode("utf-8")).hexdigest()

    async def _resolve_cosyvoice_voice_id(self, audio_url: str) -> str:
        cache_key = self._cosyvoice_audio_cache_key(audio_url)
        previous_error = self._cosyvoice_voice_errors.get(cache_key)
        if previous_error:
            raise RuntimeError(previous_error)

        preset = str(getattr(self, "_cosyvoice_preset_voice_id", "") or "").strip()
        if preset:
            await self._ensure_cosyvoice_voice_ready(preset, wait=True)
            return preset

        cached = self._cosyvoice_voice_cache.get(cache_key, "")
        if cached:
            try:
                await self._ensure_cosyvoice_voice_ready(cached, wait=True)
                return cached
            except Exception:
                self._cosyvoice_voice_cache.pop(cache_key, None)
                self._cosyvoice_verified_voice_ids.discard(cached)

        public_url = await self._resolve_public_audio_url(audio_url)
        if not public_url:
            raise RuntimeError(
                "声音克隆需要可访问的参考音频。请检查媒体中转配置。"
            )

        try:
            voice_id = await self._enroll_cosyvoice_voice(public_url)
            if not voice_id:
                raise RuntimeError("声音注册未返回 voice_id")
            await self._ensure_cosyvoice_voice_ready(voice_id, wait=True)
        except Exception as exc:
            detail = str(exc) or repr(exc)
            self._cosyvoice_voice_errors[cache_key] = detail
            raise

        self._cosyvoice_voice_cache[cache_key] = voice_id
        return voice_id

    async def _ensure_cosyvoice_voice_ready(
        self,
        voice_id: str,
        *,
        wait: bool = False,
    ) -> None:
        if voice_id in self._cosyvoice_verified_voice_ids:
            return

        import asyncio

        deadline = time.monotonic() + (90.0 if wait else 0.0)
        while True:
            status = await self._query_cosyvoice_voice_status(voice_id)
            if status == "OK":
                self._cosyvoice_verified_voice_ids.add(voice_id)
                return
            if status in {"UNDEPLOYED", "FAILED", "ERROR"}:
                raise RuntimeError(f"克隆声线状态异常: {status}")
            if not wait or time.monotonic() >= deadline:
                raise RuntimeError(f"克隆声线尚未就绪: {status or 'UNKNOWN'}")
            await asyncio.sleep(2.0)

    async def _query_cosyvoice_voice_status(self, voice_id: str) -> str:
        def _query() -> str:
            from dashscope.audio.tts_v2 import VoiceEnrollmentService

            detail = VoiceEnrollmentService().query_voice(voice_id)
            if not isinstance(detail, dict):
                return ""
            return str(detail.get("status") or "").strip().upper()

        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _query)

    async def _enroll_cosyvoice_voice(self, audio_url: str) -> str:
        """Enroll a new CosyVoice voice from a public audio URL.

        Uses DashScope VoiceEnrollmentService to create a cloned voice.
        Returns the voice_id string.
        """
        from novelvideo.config import COSYVOICE_BEAT_LANGUAGE, COSYVOICE_BEAT_TARGET_MODEL

        def _create() -> str:
            from dashscope.audio.tts_v2 import VoiceEnrollmentService

            service = VoiceEnrollmentService()
            return service.create_voice(
                target_model=COSYVOICE_BEAT_TARGET_MODEL,
                prefix="dramaclaw",
                url=audio_url,
                language_hints=[COSYVOICE_BEAT_LANGUAGE],
                max_prompt_audio_length=30.0,
            )

        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _create)

    async def _resolve_public_audio_url(self, audio_url: str) -> str:
        """Convert a data: URL to a publicly accessible URL via Cloudinary.

        Returns the original URL if it is already an http(s) URL.
        Returns empty string if conversion fails.
        """
        if audio_url.startswith(("http://", "https://")):
            return audio_url
        if not audio_url.startswith("data:"):
            return ""

        try:
            import base64

            header, b64_data = audio_url.split(",", 1)
            raw_bytes = base64.b64decode(b64_data)

            mime = "audio/mpeg"
            declared_mime = header.removeprefix("data:").split(";", 1)[0].strip()
            if declared_mime:
                mime = declared_mime

            ext = "mp3"
            if "wav" in mime:
                ext = "wav"
            elif "ogg" in mime:
                ext = "ogg"

            raw_bytes = self._prepare_cosyvoice_reference_audio(raw_bytes, ext)
            ext = "wav"

            # Resolve the same effective settings used by the media relay UI.
            from novelvideo import config
            from novelvideo.model_gateway_settings import get_effective_media_relay_config

            relay_config = get_effective_media_relay_config(
                env_provider=getattr(config, "MEDIA_RELAY_PROVIDER", ""),
                env_cloud_name=getattr(config, "CLOUDINARY_RELAY_CLOUD_NAME", ""),
                env_cloudinary_api_key=getattr(config, "CLOUDINARY_RELAY_API_KEY", ""),
                env_cloudinary_api_secret=getattr(config, "CLOUDINARY_RELAY_API_SECRET", ""),
                env_cloudinary_folder=getattr(config, "CLOUDINARY_RELAY_FOLDER", ""),
            )
            import httpx

            def _upload() -> dict:
                filename = (
                    f"voice_ref_{hashlib.md5(raw_bytes[:1024]).hexdigest()[:8]}.{ext}"
                )
                folder = relay_config.cloudinary_folder or "dramaclaw/voices"
                timestamp = int(time.time())
                signed_params = {"folder": folder, "timestamp": timestamp}
                signature_payload = "&".join(
                    f"{key}={value}"
                    for key, value in sorted(signed_params.items())
                    if value is not None and value != ""
                )
                signature = hashlib.sha1(
                    f"{signature_payload}{relay_config.cloudinary_api_secret}".encode(
                        "utf-8"
                    )
                ).hexdigest()
                url = (
                    f"https://api.cloudinary.com/v1_1/"
                    f"{relay_config.cloud_name}/raw/upload"
                )
                with httpx.Client(timeout=180.0) as client:
                    response = client.post(
                        url,
                        data={
                            **signed_params,
                            "api_key": relay_config.cloudinary_api_key,
                            "signature": signature,
                        },
                        files={
                            "file": (
                                filename,
                                raw_bytes,
                                "audio/wav",
                            )
                        },
                    )
                    response.raise_for_status()
                    return response.json()

            import asyncio

            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, _upload)
            return str(result.get("secure_url") or result.get("url") or "").strip()
        except ValueError:
            # Preserve reference-audio validation errors for the canvas UI.
            raise
        except Exception:
            return ""

    @staticmethod
    def _prepare_cosyvoice_reference_audio(raw_bytes: bytes, source_ext: str) -> bytes:
        """Normalize clone input to a compact 24 kHz mono PCM WAV.

        CosyVoice enrollment validates contiguous voiced regions. Removing only
        clear pauses before uploading prevents normal sentence breaks from being
        mistaken for a too-short voice sample.
        """
        with tempfile.TemporaryDirectory(prefix="dramaclaw-cosyvoice-") as temp_dir:
            temp_root = Path(temp_dir)
            source_path = temp_root / f"reference.{source_ext or 'mp3'}"
            output_path = temp_root / "normalized.wav"
            source_path.write_bytes(raw_bytes)
            completed = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-v",
                    "error",
                    "-i",
                    str(source_path),
                    "-af",
                    (
                        "silenceremove="
                        "start_periods=1:start_duration=0.3:start_threshold=-45dB:"
                        "stop_periods=-1:stop_duration=0.3:stop_threshold=-45dB"
                    ),
                    "-t",
                    "30",
                    "-ac",
                    "1",
                    "-ar",
                    "24000",
                    "-c:a",
                    "pcm_s16le",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
            )
            if completed.returncode != 0 or not output_path.exists():
                detail = completed.stderr.strip() or "ffmpeg failed"
                raise RuntimeError(f"参考音频转码失败: {detail}")
            normalized = output_path.read_bytes()
            if not normalized:
                raise RuntimeError("参考音频转码结果为空")
            try:
                with wave.open(io.BytesIO(normalized), "rb") as wav_file:
                    frame_rate = wav_file.getframerate()
                    frame_count = wav_file.getnframes()
                duration_seconds = frame_count / frame_rate if frame_rate else 0.0
            except (EOFError, wave.Error) as exc:
                raise RuntimeError("无法读取转码后的参考音频") from exc
            if duration_seconds < MIN_COSYVOICE_REFERENCE_SECONDS:
                raise ValueError(
                    "CosyVoice 声音克隆参考音频过短："
                    f"当前 {duration_seconds:.1f} 秒，至少需要 "
                    f"{MIN_COSYVOICE_REFERENCE_SECONDS:.0f} 秒清晰连续的人声。"
                )
            return normalized

    async def _generate_via_newapi(
        self,
        *,
        prompt: str,
        audio_url: str,
        output_path: Path,
        emotion_prompt: str = "",
    ) -> TTSResult:
        endpoint = str(self.endpoint or "").rstrip("/")
        if not endpoint.endswith("/audio/speech"):
            endpoint = f"{endpoint}/audio/speech"

        metadata: dict[str, Any] = {
            "audio_url": audio_url,
            "should_use_prompt_for_emotion": True,
        }
        if str(emotion_prompt or "").strip():
            metadata["emotion_prompt"] = str(emotion_prompt).strip()
        body: dict[str, Any] = {
            "model": self.model,
            "input": prompt,
            "metadata": metadata,
        }

        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds, follow_redirects=True
            ) as client:
                response = await client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
                self._last_provider_request_id = (
                    response.headers.get("x-request-id")
                    or response.headers.get("x-newapi-request-id")
                    or response.headers.get("x-oneapi-request-id")
                    or ""
                )
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type.lower():
                    payload = response.json()
                    self._last_provider_request_id = (
                        self._last_provider_request_id
                        or str(payload.get("request_id") or payload.get("requestId") or "").strip()
                    )
                    self._last_provider_response_id = str(payload.get("id") or "").strip()
                    result_url = _extract_audio_url(payload)
                    if not result_url:
                        return TTSResult(
                            success=False,
                            error="DramaClawAPI IndexTTS2 response missing audio bytes or URL",
                        )
                    audio_response = await client.get(result_url)
                    audio_response.raise_for_status()
                    output_path.write_bytes(audio_response.content)
                else:
                    output_path.write_bytes(response.content)

            if not output_path.exists() or output_path.stat().st_size <= 0:
                return TTSResult(success=False, error="IndexTTS2 audio file was not created")

            return TTSResult(
                success=True,
                audio_path=str(output_path),
                duration_seconds=await _audio_duration_seconds(output_path),
            )
        except Exception as exc:
            if is_insufficient_credits_error(exc):
                raise
            detail = str(exc) or repr(exc) or exc.__class__.__name__
            return TTSResult(success=False, error=f"{exc.__class__.__name__}: {detail}")
