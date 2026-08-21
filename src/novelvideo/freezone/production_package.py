"""Import Codex-confirmed production packages without AI analysis.

The converter intentionally only maps JSON to canvas data.  It never calls an
LLM, Cognee, DeepSeek, or any other remote generation service.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class PackageProject(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str = Field(min_length=1)
    style: str = "realistic"
    language: str = "zh-CN"


class PackageEpisode(BaseModel):
    model_config = ConfigDict(extra="allow")
    number: int = Field(ge=1)
    title: str = Field(min_length=1)


class PackageCharacter(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    role: str = ""
    visual: bool = True
    description: str = ""
    reference_assets: list[Any] = Field(default_factory=list)
    reference_prompt: dict[str, Any] | str | None = None


class PackageLocation(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    time_of_day: str = ""
    interior_exterior: str = ""
    description: str = ""
    qwen_prompt: str = ""
    flux_prompt: str = ""
    reference_asset_id: str | None = None
    prop_reference_asset_ids: list[str] = Field(default_factory=list)
    url: str | None = None
    image_url: str | None = None
    reference_image_url: str | None = None


class PackageShot(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)
    visual_description: str = Field(min_length=1)
    shot_type: str = Field(min_length=1)
    camera_action: str = ""
    characters: list[str] = Field(default_factory=list)
    emotion: str = Field(min_length=1)
    dialogue_ids: list[str] = Field(default_factory=list)
    keyframe_prompt: str = Field(min_length=1)
    video_prompt: str = Field(min_length=1)
    status: str = "pending"
    duration_ms: int | None = Field(default=None, ge=1)
    reference_assets: list[str] = Field(default_factory=list)
    location_reference_asset: str | None = None
    prop_reference_assets: list[str] = Field(default_factory=list)


class PackageScene(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)
    location: str = Field(min_length=1)
    time_of_day: str = Field(min_length=1)
    interior_exterior: str = Field(min_length=1)
    summary: str = ""
    shots: list[PackageShot] = Field(min_length=1)


class PackageDialogue(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)
    speaker: str = Field(min_length=1)
    text: str = Field(min_length=1)
    audio_asset_id: str | None = None
    start_ms: int | None = Field(default=None, ge=0)
    end_ms: int | None = Field(default=None, ge=0)


class PackageAsset(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)
    type: str = "file"
    role: str = ""
    url: str | None = None
    image_url: str | None = None
    name: str = ""
    label: str = ""
    generation_prompt: str = ""
    qwen_prompt: str = ""
    flux_prompt: str = ""
    description: str = ""


class ProductionPackage(BaseModel):
    model_config = ConfigDict(extra="allow")
    schema_version: Literal["ai-drama.production.v1"]
    source_package_id: str | None = None
    project: PackageProject
    episode: PackageEpisode
    characters: list[PackageCharacter] = Field(default_factory=list)
    locations: list[PackageLocation] = Field(default_factory=list)
    scenes: list[PackageScene] = Field(min_length=1)
    dialogues: list[PackageDialogue] = Field(default_factory=list)
    assets: list[PackageAsset] = Field(default_factory=list)

    @field_validator("source_package_id")
    @classmethod
    def _clean_package_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    def effective_source_package_id(self) -> str:
        if self.source_package_id:
            return self.source_package_id
        canonical = self.model_dump_json(exclude={"source_package_id"}, by_alias=True)
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:20]
        return f"codex-{digest}"


def parse_production_package(raw: Any) -> ProductionPackage:
    """Parse a JSON object and preserve Pydantic's precise field locations."""
    if not isinstance(raw, dict):
        raise ValueError("production package must be a JSON object")
    return ProductionPackage.model_validate(raw)


def package_validation_errors(exc: ValidationError) -> list[dict[str, Any]]:
    return [
        {
            "field": ".".join(str(part) for part in error.get("loc", ())) or "$",
            "message": error.get("msg", "invalid value"),
            "type": error.get("type", "value_error"),
        }
        for error in exc.errors()
    ]


def package_preview(package: ProductionPackage) -> dict[str, Any]:
    character_ids = {item.id for item in package.characters}
    location_ids = {
        location_id
        for item in package.locations
        for location_id in (item.id, item.reference_asset_id)
        if location_id
    }
    dialogue_ids = {item.id for item in package.dialogues}
    asset_ids = {item.id for item in package.assets}
    prop_asset_ids = {
        item.id
        for item in package.assets
        if item.role.strip().lower() == "prop_reference"
    }
    missing: list[dict[str, str]] = []
    for si, scene in enumerate(package.scenes):
        for hi, shot in enumerate(scene.shots):
            for character_id in shot.characters:
                if character_id not in character_ids:
                    missing.append(
                        {
                            "field": f"scenes[{si}].shots[{hi}].characters",
                            "id": character_id,
                        }
                    )
            for dialogue_id in shot.dialogue_ids:
                if dialogue_id not in dialogue_ids:
                    missing.append(
                        {
                            "field": f"scenes[{si}].shots[{hi}].dialogue_ids",
                            "id": dialogue_id,
                        }
                    )
            if (
                shot.location_reference_asset
                and shot.location_reference_asset not in location_ids
            ):
                missing.append(
                    {
                        "field": f"scenes[{si}].shots[{hi}].location_reference_asset",
                        "id": shot.location_reference_asset,
                    }
                )
            for prop_id in shot.prop_reference_assets:
                if prop_id not in prop_asset_ids:
                    missing.append(
                        {
                            "field": f"scenes[{si}].shots[{hi}].prop_reference_assets",
                            "id": prop_id,
                        }
                    )
    for dialogue in package.dialogues:
        if dialogue.audio_asset_id and dialogue.audio_asset_id not in asset_ids:
            missing.append(
                {
                    "field": f"dialogues[{dialogue.id}].audio_asset_id",
                    "id": dialogue.audio_asset_id,
                }
            )
    for asset in package.assets:
        if asset.type.lower() == "audio" and not _first_text(asset.url):
            missing.append({"field": f"assets[{asset.id}].url", "id": asset.id})
    return {
        "project_title": package.project.title,
        "episode_number": package.episode.number,
        "episode_title": package.episode.title,
        "scene_count": len(package.scenes),
        "shot_count": sum(len(scene.shots) for scene in package.scenes),
        "character_count": len(package.characters),
        "visual_character_count": sum(
            1 for character in package.characters if character.visual
        ),
        "location_count": len(package.locations),
        "prop_reference_count": len(prop_asset_ids),
        "dialogue_count": len(package.dialogues),
        "audio_count": sum(
            1 for asset in package.assets if asset.type.lower() == "audio"
        ),
        "asset_count": len(package.assets),
        "missing_resources": missing,
        "source_package_id": package.effective_source_package_id(),
        "ai_analysis_called": False,
    }


def _source_meta(
    package: ProductionPackage,
    *,
    scene_id: str | None = None,
    shot_id: str | None = None,
    asset_id: str | None = None,
    version: int = 1,
) -> dict[str, Any]:
    return {
        "source": "codex",
        "source_package_id": package.effective_source_package_id(),
        "episode_number": package.episode.number,
        "scene_id": scene_id,
        "shot_id": shot_id,
        "asset_id": asset_id,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "version": version,
    }


def _node(
    node_id: str,
    node_type: str,
    x: float,
    y: float,
    data: dict[str, Any],
    *,
    parent_id: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": node_id,
        "type": node_type,
        "position": {"x": x, "y": y},
        "data": data,
    }
    if parent_id:
        result["parentId"] = parent_id
        result["extent"] = "parent"
    return result


def _edge(
    edge_id: str,
    source: str,
    target: str,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    edge = {"id": edge_id, "source": source, "target": target}
    if data:
        edge["data"] = data
    return edge


def _first_text(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _character_prompt(character: PackageCharacter) -> str:
    prompt = character.reference_prompt
    if isinstance(prompt, dict):
        return _first_text(
            prompt.get("qwen"), prompt.get("flux"), character.description
        )
    return _first_text(prompt, character.description)


def _location_prompt(
    location: PackageLocation, asset: PackageAsset | None = None
) -> str:
    return _first_text(
        location.qwen_prompt,
        location.flux_prompt,
        _asset_prompt(asset) if asset else None,
        location.description,
    )


def _location_url(
    location: PackageLocation, asset: PackageAsset | None = None
) -> str | None:
    return (
        _first_text(
            location.url,
            location.image_url,
            location.reference_image_url,
            _asset_url(asset) if asset else None,
        )
        or None
    )


def _asset_prompt(asset: PackageAsset) -> str:
    return _first_text(
        asset.generation_prompt,
        asset.qwen_prompt,
        asset.flux_prompt,
        asset.description,
    )


def _asset_url(asset: PackageAsset) -> str | None:
    return _first_text(asset.url, asset.image_url) or None


def _unique_strings(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _production_reference_edge(
    edge_id: str,
    source: str,
    target: str,
    *,
    role: str,
    asset_id: str,
) -> dict[str, Any]:
    target_kind = "prop" if role == "prop" else "scene"
    target_key = "prop_id" if role == "prop" else "scene_id"
    return _edge(
        edge_id,
        source,
        target,
        {
            "edgeKind": "production_reference",
            "propagates": True,
            "role": role,
            "reference_target": {"kind": target_kind, target_key: asset_id},
        },
    )


def production_keyframe_is_approved(
    canvas_payload: dict[str, Any], video_node_id: str
) -> bool:
    """Return whether a Codex production video has an image upstream.

    Review status is an optional editorial marker. It must not block the normal
    generate-video flow; users can regenerate a frame when they dislike it.
    """
    nodes = [item for item in canvas_payload.get("nodes", []) if isinstance(item, dict)]
    target = next((item for item in nodes if item.get("id") == video_node_id), None)
    target_data = target.get("data") if isinstance(target, dict) else None
    if not isinstance(target_data, dict) or not target_data.get(
        "requiresApprovedKeyframe"
    ):
        return True
    incoming = {
        item.get("source")
        for item in canvas_payload.get("edges", [])
        if isinstance(item, dict) and item.get("target") == video_node_id
    }
    required_keyframe_id = str(target_data.get("keyframeNodeId") or "").strip()
    return any(
        item.get("id") in incoming
        and (
            item.get("id") == required_keyframe_id
            if required_keyframe_id
            else ":keyframe:" in str(item.get("id") or "")
        )
        and isinstance(item.get("data"), dict)
        and bool(item["data"].get("imageUrl"))
        for item in nodes
    )


def build_canvas_from_package(
    package: ProductionPackage, existing: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Build deterministic React Flow nodes/edges, merging prior outputs on re-import."""
    package_id = package.effective_source_package_id()
    old_package_meta = (
        ((existing or {}).get("metadata") or {}).get("production_package")
        if isinstance((existing or {}).get("metadata"), dict)
        else None
    )
    package_version = (
        (int(old_package_meta.get("version")) + 1)
        if isinstance(old_package_meta, dict)
        and str(old_package_meta.get("version", "")).isdigit()
        else 1
    )
    old_nodes = {
        str(node.get("id")): node
        for node in (existing or {}).get("nodes", [])
        if isinstance(node, dict)
    }
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    def add(node: dict[str, Any]) -> None:
        old = old_nodes.get(node["id"])
        if old:
            old_data = old.get("data") if isinstance(old.get("data"), dict) else {}
            new_data = node.get("data") if isinstance(node.get("data"), dict) else {}
            # Keep generated media and review decisions while replacing source content.
            preserved = {
                key: value
                for key, value in old_data.items()
                if key
                in {
                    "imageUrl",
                    "previewImageUrl",
                    "videoUrl",
                    "generationError",
                    "generationErrorRequestId",
                    "generationTask",
                    "reviewStatus",
                    "reviewNote",
                    "productionStatus",
                    "comfyuiJob",
                    "keyframeReviewStatus",
                    "keyframeUrl",
                    "outputUrl",
                    "created_at",
                }
            }
            new_data = {**new_data, **preserved}
            # A newly supplied package URL is authoritative. If the package still
            # has no URL, keep any image previously generated on this stable node.
            for media_key in ("imageUrl", "previewImageUrl", "videoUrl", "audioUrl"):
                if new_data.get(media_key) is None and old_data.get(media_key):
                    new_data[media_key] = old_data[media_key]
                elif node.get("data", {}).get(media_key):
                    new_data[media_key] = node["data"][media_key]
            if any(
                node.get("data", {}).get(media_key)
                for media_key in ("imageUrl", "videoUrl", "audioUrl")
            ):
                new_data["productionStatus"] = node["data"].get("productionStatus")
            node["data"] = new_data
            if isinstance(old.get("position"), dict):
                node["position"] = old["position"]
        node_data = node.get("data")
        if isinstance(node_data, dict):
            node_data["version"] = package_version
        nodes.append(node)

    script_id = f"production:{package_id}:script"
    add(
        _node(
            script_id,
            "scriptNode",
            40,
            40,
            {
                "displayName": package.project.title,
                "prompt": "",
                "scriptResult": package.model_dump(mode="json"),
                "productionPackage": package.model_dump(mode="json"),
                "productionStatus": "imported",
                **_source_meta(package),
            },
        )
    )

    asset_by_id = {item.id: item for item in package.assets}
    location_ids: dict[str, str] = {}
    for index, location in enumerate(package.locations):
        stable_asset_id = _first_text(location.reference_asset_id, location.id)
        location_asset = asset_by_id.get(stable_asset_id)
        node_id = f"production:{package_id}:location:{stable_asset_id}"
        location_ids[location.id] = node_id
        if location.reference_asset_id:
            location_ids[location.reference_asset_id] = node_id
        image_url = _location_url(location, location_asset)
        generation_prompt = _location_prompt(location, location_asset)
        add(
            _node(
                node_id,
                "imageGenNode",
                40,
                260 + index * 270,
                {
                    "displayName": f"场景参考图 · {location.name}",
                    "imageUrl": image_url,
                    "previewImageUrl": image_url,
                    "aspectRatio": "16:9",
                    "requestAspectRatio": "16:9",
                    "prompt": generation_prompt,
                    "generationPrompt": generation_prompt,
                    "model": "comfyui_qwen_image",
                    "size": "2K",
                    "count": 1,
                    "referenceImageUrl": None,
                    "location": location.model_dump(mode="json"),
                    "asset": location_asset.model_dump(mode="json")
                    if location_asset
                    else None,
                    "output_role": "scene_master",
                    "slot_target": {"kind": "scene_master", "scene_id": location.id},
                    "__freezone_source": {
                        "kind": "scene",
                        "role": "scene_master",
                        "label": location.name,
                        "meta": {"scene_id": location.id, "location_id": location.id},
                    },
                    "productionStatus": "已导入" if image_url else "待生成",
                    **_source_meta(package, asset_id=stable_asset_id),
                },
            )
        )
        edges.append(_edge(f"edge:{script_id}:{node_id}", script_id, node_id))

    prop_node_ids: dict[str, str] = {}
    prop_assets = [
        asset
        for asset in package.assets
        if asset.role.strip().lower() == "prop_reference"
    ]
    for index, asset in enumerate(prop_assets):
        node_id = f"production:{package_id}:prop:{asset.id}"
        prop_node_ids[asset.id] = node_id
        image_url = _asset_url(asset)
        label = _first_text(asset.label, asset.name, asset.id)
        add(
            _node(
                node_id,
                "imageGenNode",
                400,
                260 + index * 270,
                {
                    "displayName": f"道具参考图 · {label}",
                    "imageUrl": image_url,
                    "previewImageUrl": image_url,
                    "aspectRatio": "1:1",
                    "requestAspectRatio": "1:1",
                    "prompt": _asset_prompt(asset),
                    "generationPrompt": _asset_prompt(asset),
                    "model": "comfyui_qwen_image",
                    "size": "2K",
                    "count": 1,
                    "referenceImageUrl": None,
                    "asset": asset.model_dump(mode="json"),
                    "output_role": "prop_reference",
                    "slot_target": {"kind": "prop_ref", "prop_id": asset.id},
                    "reference_target": {"kind": "prop", "prop_id": asset.id},
                    "__freezone_source": {
                        "kind": "prop",
                        "role": "prop_reference",
                        "label": label,
                        "meta": {"prop_id": asset.id},
                    },
                    "productionStatus": "已导入" if image_url else "待生成",
                    **_source_meta(package, asset_id=asset.id),
                },
            )
        )
        edges.append(_edge(f"edge:{script_id}:{node_id}", script_id, node_id))

    character_ids: dict[str, str] = {}
    visual_characters = [
        character for character in package.characters if character.visual
    ]
    for index, character in enumerate(visual_characters):
        node_id = f"production:{package_id}:character:{character.id}"
        character_ids[character.id] = node_id
        add(
            _node(
                node_id,
                "imageGenNode",
                760,
                260 + index * 270,
                {
                    "displayName": f"人物 · {character.name}",
                    "imageUrl": None,
                    "previewImageUrl": None,
                    "aspectRatio": "3:4",
                    "requestAspectRatio": "3:4",
                    "prompt": _character_prompt(character),
                    "model": "comfyui_qwen_image",
                    "size": "2K",
                    "count": 1,
                    "referenceImageUrl": None,
                    "character": character.model_dump(mode="json"),
                    "referenceAssets": character.reference_assets,
                    "output_role": "character_portrait",
                    "__freezone_source": {
                        "kind": "identity",
                        "role": "character_identity",
                        "label": character.name,
                        "meta": {"identity_id": character.id},
                    },
                    "productionStatus": "待生成",
                    **_source_meta(package, asset_id=character.id),
                },
            )
        )
        edges.append(_edge(f"edge:{script_id}:{node_id}", script_id, node_id))

    dialogue_by_id = {item.id: item for item in package.dialogues}
    for scene_index, scene in enumerate(package.scenes):
        scene_id = f"production:{package_id}:scene:{scene.id}"
        scene_node = _node(
            scene_id,
            "groupNode",
            1240,
            40 + scene_index * 680,
            {
                "displayName": f"场景 {scene.id} · {scene.location}",
                "label": f"场景 {scene.id} · {scene.location}",
                "scene": scene.model_dump(mode="json", exclude={"shots"}),
                "productionStatus": "imported",
                **_source_meta(package, scene_id=scene.id),
            },
        )
        scene_node["style"] = {
            "width": 1120,
            "height": max(520, len(scene.shots) * 260 + 80),
        }
        add(scene_node)
        edges.append(_edge(f"edge:{script_id}:{scene_id}", script_id, scene_id))
        for shot_index, shot in enumerate(scene.shots):
            shot_id = f"production:{package_id}:shot:{shot.id}"
            shot_y = 40 + shot_index * 260
            location_reference_ids = _unique_strings(
                (
                    [shot.location_reference_asset]
                    if shot.location_reference_asset
                    else []
                )
                + [item for item in shot.reference_assets if item in location_ids]
            )
            if not location_reference_ids:
                matching_locations = [
                    location.id
                    for location in package.locations
                    if location.name.strip() == scene.location.strip()
                ]
                location_reference_ids = _unique_strings(matching_locations[:1])
            prop_reference_ids = _unique_strings(
                shot.prop_reference_assets
                + [item for item in shot.reference_assets if item in prop_node_ids]
            )
            location_reference_pairs = [
                (item, location_ids[item])
                for item in location_reference_ids
                if item in location_ids
            ]
            prop_reference_pairs = [
                (item, prop_node_ids[item])
                for item in prop_reference_ids
                if item in prop_node_ids
            ]
            location_reference_nodes = [
                node_id for _item, node_id in location_reference_pairs
            ]
            prop_reference_nodes = [node_id for _item, node_id in prop_reference_pairs]
            production_reference_node_ids = (
                location_reference_nodes + prop_reference_nodes
            )
            dialogue_text = "\n".join(
                f"{dialogue_by_id[item].speaker}: {dialogue_by_id[item].text}"
                for item in shot.dialogue_ids
                if item in dialogue_by_id
            )
            add(
                _node(
                    shot_id,
                    "textAnnotationNode",
                    30,
                    shot_y,
                    {
                        "displayName": f"镜头 {shot.id}",
                        "content": shot.visual_description,
                        "shot": shot.model_dump(mode="json"),
                        "scene": scene.model_dump(mode="json", exclude={"shots"}),
                        "dialogueText": dialogue_text,
                        "characters": [
                            character_ids[item]
                            for item in shot.characters
                            if item in character_ids
                        ],
                        "locationReferenceAsset": shot.location_reference_asset,
                        "locationReferenceNodeIds": location_reference_nodes,
                        "propReferenceAssets": prop_reference_ids,
                        "propReferenceNodeIds": prop_reference_nodes,
                        "productionStatus": shot.status or "pending",
                        **_source_meta(package, scene_id=scene.id, shot_id=shot.id),
                    },
                    parent_id=scene_id,
                )
            )
            edges.append(_edge(f"edge:{scene_id}:{shot_id}", scene_id, shot_id))
            for location_id, node_id in location_reference_pairs:
                edges.append(
                    _production_reference_edge(
                        f"edge:{node_id}:{shot_id}:scene",
                        node_id,
                        shot_id,
                        role="scene_master",
                        asset_id=location_id,
                    )
                )
            for prop_id, node_id in prop_reference_pairs:
                edges.append(
                    _production_reference_edge(
                        f"edge:{node_id}:{shot_id}:prop",
                        node_id,
                        shot_id,
                        role="prop",
                        asset_id=prop_id,
                    )
                )

            keyframe_id = f"production:{package_id}:keyframe:{shot.id}"
            add(
                _node(
                    keyframe_id,
                    "imageGenNode",
                    360,
                    shot_y,
                    {
                        "displayName": f"关键帧 · {shot.id}",
                        "imageUrl": None,
                        "previewImageUrl": None,
                        "aspectRatio": "16:9",
                        "requestAspectRatio": "16:9",
                        "prompt": shot.keyframe_prompt,
                        "model": "comfyui_qwen_image",
                        "size": "2K",
                        "count": 1,
                        "referenceImageUrl": None,
                        "referenceAssets": [
                            asset_by_id[item].model_dump(mode="json")
                            for character_id in shot.characters
                            for character in package.characters
                            if character.id == character_id
                            for item in character.reference_assets
                            if isinstance(item, str) and item in asset_by_id
                        ]
                        + [
                            asset_by_id[item].model_dump(mode="json")
                            for item in prop_reference_ids
                            if item in asset_by_id
                        ],
                        "locationReferenceAssets": location_reference_ids,
                        "propReferenceAssets": prop_reference_ids,
                        "productionReferenceNodeIds": production_reference_node_ids,
                        "keyframePrompt": shot.keyframe_prompt,
                        "reviewStatus": "pending",
                        "productionStatus": "待生成",
                        "generationError": None,
                        "comfyuiJob": None,
                        **_source_meta(package, scene_id=scene.id, shot_id=shot.id),
                    },
                    parent_id=scene_id,
                )
            )
            edges.append(_edge(f"edge:{shot_id}:{keyframe_id}", shot_id, keyframe_id))
            for location_id, node_id in location_reference_pairs:
                edges.append(
                    _production_reference_edge(
                        f"edge:{node_id}:{keyframe_id}:scene",
                        node_id,
                        keyframe_id,
                        role="scene_master",
                        asset_id=location_id,
                    )
                )
            for prop_id, node_id in prop_reference_pairs:
                edges.append(
                    _production_reference_edge(
                        f"edge:{node_id}:{keyframe_id}:prop",
                        node_id,
                        keyframe_id,
                        role="prop",
                        asset_id=prop_id,
                    )
                )
            for character_id in shot.characters:
                if character_id in character_ids:
                    edges.append(
                        _edge(
                            f"edge:{character_ids[character_id]}:{shot_id}",
                            character_ids[character_id],
                            shot_id,
                        )
                    )
                    edges.append(
                        _edge(
                            f"edge:{character_ids[character_id]}:{keyframe_id}",
                            character_ids[character_id],
                            keyframe_id,
                        )
                    )
            for dialogue_id in shot.dialogue_ids:
                dialogue = dialogue_by_id.get(dialogue_id)
                if not dialogue or not dialogue.audio_asset_id:
                    continue
                audio_id = f"production:{package_id}:audio:{dialogue.audio_asset_id}"
                if not any(node["id"] == audio_id for node in nodes):
                    asset = asset_by_id.get(dialogue.audio_asset_id)
                    add(
                        _node(
                            audio_id,
                            "audioNode",
                            420,
                            260 + len(nodes) * 4,
                            {
                                "displayName": asset.label
                                if asset
                                else dialogue.speaker or dialogue.id,
                                "audioUrl": asset.url if asset else None,
                                "sourceFileName": asset.url.rsplit("/", 1)[-1]
                                if asset and asset.url
                                else None,
                                "durationMs": (dialogue.end_ms - dialogue.start_ms)
                                if dialogue.start_ms is not None
                                and dialogue.end_ms is not None
                                else None,
                                "text": dialogue.text,
                                "speaker": dialogue.speaker,
                                "dialogue": dialogue.model_dump(mode="json"),
                                "productionStatus": "已导入",
                                **_source_meta(
                                    package, scene_id=scene.id, shot_id=shot.id
                                ),
                            },
                        )
                    )
                edges.append(_edge(f"edge:{shot_id}:{audio_id}", shot_id, audio_id))

            video_id = f"production:{package_id}:video:{shot.id}"
            add(
                _node(
                    video_id,
                    "videoNode",
                    700,
                    shot_y,
                    {
                        "displayName": f"视频 · {shot.id}",
                        "videoUrl": None,
                        "previewImageUrl": None,
                        "aspectRatio": "16:9",
                        "prompt": shot.video_prompt,
                        "videoPrompt": shot.video_prompt,
                        "model": "minimax_h3",
                        "genMode": "imageToVideo",
                        "keyframeNodeId": keyframe_id,
                        "referenceOrder": [keyframe_id, *production_reference_node_ids],
                        "locationReferenceAssets": location_reference_ids,
                        "propReferenceAssets": prop_reference_ids,
                        "productionReferenceNodeIds": production_reference_node_ids,
                        "durationSec": max(1, round((shot.duration_ms or 5000) / 1000)),
                        "productionStatus": "待生成",
                        "keyframeReviewStatus": "pending",
                        "requiresApprovedKeyframe": True,
                        "generationError": None,
                        **_source_meta(package, scene_id=scene.id, shot_id=shot.id),
                    },
                    parent_id=scene_id,
                )
            )
            edges.append(_edge(f"edge:{keyframe_id}:{video_id}", keyframe_id, video_id))
            for location_id, node_id in location_reference_pairs:
                edges.append(
                    _production_reference_edge(
                        f"edge:{node_id}:{video_id}:scene",
                        node_id,
                        video_id,
                        role="scene_master",
                        asset_id=location_id,
                    )
                )
            for prop_id, node_id in prop_reference_pairs:
                edges.append(
                    _production_reference_edge(
                        f"edge:{node_id}:{video_id}:prop",
                        node_id,
                        video_id,
                        role="prop",
                        asset_id=prop_id,
                    )
                )
    return {
        "nodes": nodes,
        "edges": edges,
        "viewport": (existing or {}).get("viewport") or {"x": 0, "y": 0, "zoom": 0.8},
        "metadata": {
            **(
                (existing or {}).get("metadata")
                if isinstance((existing or {}).get("metadata"), dict)
                else {}
            ),
            "production_package": {
                "schema_version": package.schema_version,
                "source": "codex",
                "source_package_id": package_id,
                "project_title": package.project.title,
                "episode_number": package.episode.number,
                "version": package_version,
                "ai_analysis_called": False,
            },
        },
        "episode": package.episode.number,
        "canvas_scope": "episode",
    }
