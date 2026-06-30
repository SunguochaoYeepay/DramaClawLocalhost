"""Async-safe media IO helpers shared by API, UI, and generation services."""

from __future__ import annotations

from pathlib import Path

from novelvideo.utils.async_ops import call_blocking


def get_audio_duration(audio_path: str) -> float:
    """Return audio duration in seconds using ffprobe."""
    import subprocess

    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audio_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except Exception:
        return 5.0


async def get_audio_duration_async(audio_path: str) -> float:
    """Return audio duration without blocking the event loop."""
    return await call_blocking(get_audio_duration, audio_path)


async def crop_image_to_path(
    image_path: str | Path,
    *,
    x: int,
    y: int,
    width: int,
    height: int,
    output_path: str | Path | None = None,
) -> tuple[int, int]:
    """Crop an image with bounds clamping and save it to disk."""

    def _crop() -> tuple[int, int]:
        from PIL import Image

        source = Path(image_path)
        target = Path(output_path) if output_path is not None else source
        with Image.open(source) as img:
            crop_x = max(0, min(int(x), img.width - 1))
            crop_y = max(0, min(int(y), img.height - 1))
            right = min(crop_x + max(1, int(width)), img.width)
            bottom = min(crop_y + max(1, int(height)), img.height)
            cropped = img.crop((crop_x, crop_y, right, bottom))
            target.parent.mkdir(parents=True, exist_ok=True)
            cropped.save(target)
            return cropped.width, cropped.height

    return await call_blocking(_crop)


__all__ = ["crop_image_to_path", "get_audio_duration", "get_audio_duration_async"]
