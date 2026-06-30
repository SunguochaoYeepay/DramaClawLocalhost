"""Queue naming helpers shared by task backends."""

from __future__ import annotations

QUEUE_KINDS = {"default", "video", "world", "ffmpeg"}


def normalize_queue_kind(kind: str | None) -> str:
    value = (kind or "default").strip().lower()
    return value if value in QUEUE_KINDS else "default"


def queue_name(home_node_id: str, kind: str | None = None) -> str:
    lane = normalize_queue_kind(kind)
    safe_node = str(home_node_id or "local").replace(":", "_").replace("/", "_")
    safe_lane = lane.replace(":", "_").replace("/", "_")
    return f"node.{safe_node}.{safe_lane}"
