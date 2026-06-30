"""Render preflight checks for sketch AI identity detection."""

from collections.abc import Iterable
from typing import Any

from novelvideo.models import NO_CHARACTER_MARKER, real_detected_identities


def _beat_get(beat: Any, key: str, default: Any = None) -> Any:
    if isinstance(beat, dict):
        return beat.get(key, default)
    return getattr(beat, key, default)


def _has_identity_detection_state(beat: Any) -> bool:
    identities = _beat_get(beat, "detected_identities", None)
    if isinstance(identities, str):
        identities = [identities]
    try:
        values = [str(item or "").strip() for item in (identities or [])]
    except TypeError:
        return False
    return NO_CHARACTER_MARKER in values or bool(real_detected_identities(values))


def render_ai_detection_error(beats: Iterable[Any] | None = None) -> str | None:
    """Return an error when any render beat has no explicit identity detection state."""
    beat_list = list(beats or [])
    missing = [beat for beat in beat_list if not _has_identity_detection_state(beat)]
    if not missing:
        return None
    beat_numbers = ", ".join(f"#{_beat_get(beat, 'beat_number', '?')}" for beat in missing)
    return (
        "Render 前请先到「草图」点击「AI 检测」识别出场身份，"
        "或在「更多 > 出场身份」手工标注。"
        f"以下 beat 尚未检测/标注：{beat_numbers}。"
        "如果确实没有出场角色，请选择「无角色出场」。"
    )
