"""Unified asset lookup endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends

from novelvideo.api.auth import get_api_user
from novelvideo.api.deps import make_sqlite_store_for_context, resolve_project_scope
from novelvideo.models import beat_scene_id, real_detected_identities, real_detected_props

router = APIRouter()

VALID_REFERENCE_TYPES = {"identity", "scene", "prop"}


def _contains(values: object, target: str) -> bool:
    return target in {str(value or "").strip() for value in (values or [])}


def _json_list(value: object) -> list[str]:
    if isinstance(value, list):
        raw = value
    else:
        try:
            raw = json.loads(str(value or "[]"))
        except (TypeError, ValueError, json.JSONDecodeError):
            raw = []
    return [str(item or "").strip() for item in raw if str(item or "").strip()]


@router.get("/projects/{project}/assets/{asset_type}/{asset_id}/references")
async def get_asset_references(
    project: str,
    asset_type: str,
    asset_id: str,
    user: dict = Depends(get_api_user),
):
    """Return beat references for a character identity, scene, or prop asset.

    Matching follows the persisted beat contract:
    - identity: ``detected_identities`` stores ``identity_id``.
    - scene: ``scene_ref.scene_id`` stores the scene ``name``.
    - prop: ``detected_props`` stores the prop ``name`` / episode prop id.
    """
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    normalized_type = str(asset_type or "").strip().lower()
    target_id = str(asset_id or "").strip()
    if normalized_type not in VALID_REFERENCE_TYPES:
        return {"ok": False, "error": f"Unsupported asset type: {asset_type}"}
    if not target_id:
        return {"ok": False, "error": "Asset id is required"}

    store = await make_sqlite_store_for_context(resolved.ctx)
    try:
        beats = await store.list_visual_beats()
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()
    references: list[dict[str, int]] = []
    co_identities: set[str] = set()
    co_props: set[str] = set()

    for beat in beats:
        episode = int(getattr(beat, "episode_number", 0) or 0)
        beat_number = int(getattr(beat, "beat_number", 0) or 0)
        scene_id = beat_scene_id(beat)
        detected_identities = real_detected_identities(
            _json_list(getattr(beat, "detected_identities_json", "[]"))
        )
        detected_props = real_detected_props(
            _json_list(getattr(beat, "detected_props_json", "[]"))
        )

        matched = False
        if normalized_type == "identity":
            matched = _contains(detected_identities, target_id)
        elif normalized_type == "scene":
            matched = scene_id == target_id
        elif normalized_type == "prop":
            matched = _contains(detected_props, target_id)

        if not matched:
            continue

        references.append({"episode": episode, "beat_number": beat_number})
        if normalized_type == "scene":
            co_identities.update(str(item or "").strip() for item in detected_identities if item)
            co_props.update(str(item or "").strip() for item in detected_props if item)

    data: dict[str, object] = {"beats": references}
    if normalized_type == "scene":
        data["co_identities"] = sorted(co_identities)
        data["co_props"] = sorted(co_props)
    return {"ok": True, "data": data}
