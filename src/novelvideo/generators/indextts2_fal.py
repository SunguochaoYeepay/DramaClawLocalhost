"""IndexTTS2 client for Seedance 2.0 dialogue audio preparation."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import httpx

from novelvideo.ports import get_usage_meter
from novelvideo.shared.billing_errors import is_insufficient_credits_error
from novelvideo.generators.tts_generator import TTSResult


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
    """Small IndexTTS2 client.

    The class name is retained for compatibility with existing v2.0 call sites.
    ``INDEXTTS2_PROVIDER=newapi`` routes through newAPI's OpenAI audio endpoint;
    ``INDEXTTS2_PROVIDER=fal`` keeps the original fal.ai direct path available.
    """

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
            FAL_API_KEY,
            INDEXTTS2_FAL_ENDPOINT,
            INDEXTTS2_NEWAPI_MODEL,
            INDEXTTS2_PROVIDER,
            INDEXTTS2_TIMEOUT_SECONDS,
            get_effective_newapi_gateway_config,
        )

        self.provider = (provider if provider is not None else INDEXTTS2_PROVIDER).strip().lower()
        if self.provider not in {"newapi", "fal"}:
            self.provider = "newapi"
        if self.provider == "newapi":
            gateway = get_effective_newapi_gateway_config()
            self.api_key = api_key if api_key is not None else gateway.api_key
            self.endpoint = endpoint or gateway.base_url
            self.model = model or INDEXTTS2_NEWAPI_MODEL
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
            key_name = "DramaClawAPI API key" if self.provider == "newapi" else "FAL_KEY/FAL_API_KEY"
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
        source = "indextts2_newapi" if self.provider == "newapi" else "indextts2_fal"
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
