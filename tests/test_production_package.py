import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from novelvideo.freezone.production_package import (
    build_canvas_from_package,
    package_preview,
    package_validation_errors,
    parse_production_package,
    production_keyframe_is_approved,
)


FIXTURE = Path(__file__).parent / "fixtures" / "production_package_minimal.json"


def load_fixture():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def load_reference_fixture():
    raw = load_fixture()
    raw["characters"][-1]["visual"] = False
    raw["locations"] = [
        {
            "id": "apartment_dining_room_night",
            "reference_asset_id": "location_plate_apartment_dining_room_night",
            "name": "客餐厅",
            "time_of_day": "夜",
            "interior_exterior": "内",
            "qwen_prompt": "写实普通中国城市公寓客餐厅，无人物，16:9",
            "flux_prompt": "Photorealistic Chinese apartment dining room, no people, 16:9",
        }
    ]
    props = [
        ("wooden_table", "木质餐桌"),
        ("household_ledger", "家庭账本"),
        ("black_phone", "黑色手机"),
        ("homework_set", "作业本与铅笔"),
        ("ceramic_bowl", "陶瓷碗"),
    ]
    raw["assets"].extend(
        {
            "id": prop_id,
            "type": "image",
            "role": "prop_reference",
            "label": label,
            "url": "/static/ceramic-bowl.png" if prop_id == "ceramic_bowl" else "",
            "generation_prompt": f"{label}道具参考图，纯色背景",
        }
        for prop_id, label in props
    )
    raw["assets"].append(
        {
            "id": "location_plate_apartment_dining_room_night",
            "type": "image_reference",
            "role": "location_plate",
            "label": "客餐厅场景参考图",
            "url": "",
            "generation_prompt": "资产中的备用客餐厅提示词",
        }
    )
    prop_ids = [prop_id for prop_id, _label in props]
    for scene in raw["scenes"]:
        original = scene["shots"][0]
        original["location_reference_asset"] = (
            "location_plate_apartment_dining_room_night"
        )
        original["prop_reference_assets"] = prop_ids
        duplicate = copy.deepcopy(original)
        duplicate["id"] = f"{original['id']}-02"
        duplicate["dialogue_ids"] = []
        scene["shots"].append(duplicate)
    return raw


def test_preview_preserves_story_counts_and_audio():
    package = parse_production_package(load_fixture())
    summary = package_preview(package)
    assert summary["project_title"] == "藏在账单里的三千块"
    assert summary["scene_count"] == 5
    assert summary["shot_count"] == 5
    assert summary["character_count"] == 5
    assert summary["visual_character_count"] == 5
    assert summary["location_count"] == 0
    assert summary["prop_reference_count"] == 0
    assert summary["audio_count"] == 2
    assert summary["ai_analysis_called"] is False
    assert summary["missing_resources"] == []


def test_import_graph_has_stable_relationships_and_reimport_preserves_review():
    package = parse_production_package(load_fixture())
    first = build_canvas_from_package(package)
    keyframe_id = "production:codex-bill-3000-v1:keyframe:1-1-01"
    first_keyframe = next(node for node in first["nodes"] if node["id"] == keyframe_id)
    first_keyframe["data"]["imageUrl"] = "/static/frame.png"
    first_keyframe["data"]["reviewStatus"] = "approved"
    second = build_canvas_from_package(package, first)
    second_keyframe = next(
        node for node in second["nodes"] if node["id"] == keyframe_id
    )
    assert second_keyframe["data"]["imageUrl"] == "/static/frame.png"
    assert second_keyframe["data"]["reviewStatus"] == "approved"
    edge_pairs = {(edge["source"], edge["target"]) for edge in second["edges"]}
    assert (
        "production:codex-bill-3000-v1:script",
        "production:codex-bill-3000-v1:scene:1-1",
    ) in edge_pairs
    assert ("production:codex-bill-3000-v1:shot:1-1-01", keyframe_id) in edge_pairs
    assert (keyframe_id, "production:codex-bill-3000-v1:video:1-1-01") in edge_pairs
    video_id = "production:codex-bill-3000-v1:video:1-1-01"
    assert production_keyframe_is_approved(second, video_id) is True


def test_video_is_blocked_until_keyframe_exists_and_preserves_failure():
    package = parse_production_package(load_fixture())
    canvas = build_canvas_from_package(package)
    video_id = "production:codex-bill-3000-v1:video:1-1-01"
    assert production_keyframe_is_approved(canvas, video_id) is False
    keyframe = next(
        node for node in canvas["nodes"] if ":keyframe:1-1-01" in node["id"]
    )
    keyframe["data"].update(
        {
            "imageUrl": "/frame.png",
            "reviewStatus": "pending",
            "generationError": "old failure",
        }
    )
    assert production_keyframe_is_approved(canvas, video_id) is True
    reimported = build_canvas_from_package(package, canvas)
    assert (
        next(node for node in reimported["nodes"] if node["id"] == keyframe["id"])[
            "data"
        ]["generationError"]
        == "old failure"
    )


def test_validation_reports_nested_field_path():
    raw = load_fixture()
    del raw["scenes"][0]["shots"][0]["keyframe_prompt"]
    with pytest.raises(ValidationError) as exc_info:
        parse_production_package(raw)
    errors = package_validation_errors(exc_info.value)
    assert any(error["field"] == "scenes.0.shots.0.keyframe_prompt" for error in errors)


def test_import_graph_materializes_reusable_location_and_prop_references():
    package = parse_production_package(load_reference_fixture())
    preview = package_preview(package)
    assert preview["shot_count"] == 10
    assert preview["visual_character_count"] == 4
    assert preview["location_count"] == 1
    assert preview["prop_reference_count"] == 5
    assert preview["missing_resources"] == []

    canvas = build_canvas_from_package(package)
    nodes = {node["id"]: node for node in canvas["nodes"]}
    edge_pairs = {(edge["source"], edge["target"]): edge for edge in canvas["edges"]}
    prefix = "production:codex-bill-3000-v1"
    location_id = f"{prefix}:location:location_plate_apartment_dining_room_night"
    prop_ids = [
        f"{prefix}:prop:wooden_table",
        f"{prefix}:prop:household_ledger",
        f"{prefix}:prop:black_phone",
        f"{prefix}:prop:homework_set",
        f"{prefix}:prop:ceramic_bowl",
    ]

    assert nodes[location_id]["data"]["displayName"] == "场景参考图 · 客餐厅"
    assert (
        nodes[location_id]["data"]["asset_id"]
        == "location_plate_apartment_dining_room_night"
    )
    assert nodes[location_id]["data"]["prompt"].startswith("写实普通中国城市公寓")
    assert nodes[location_id]["data"]["productionStatus"] == "待生成"
    assert (
        nodes[f"{prefix}:prop:wooden_table"]["data"]["displayName"]
        == "道具参考图 · 木质餐桌"
    )
    assert nodes[f"{prefix}:prop:wooden_table"]["data"]["productionStatus"] == "待生成"
    assert (
        nodes[f"{prefix}:prop:wooden_table"]["data"]["prompt"]
        == "木质餐桌道具参考图，纯色背景"
    )
    assert (
        nodes[f"{prefix}:prop:ceramic_bowl"]["data"]["imageUrl"]
        == "/static/ceramic-bowl.png"
    )
    assert nodes[f"{prefix}:prop:ceramic_bowl"]["data"]["productionStatus"] == "已导入"
    assert (
        len(
            [node_id for node_id in nodes if node_id.startswith(f"{prefix}:character:")]
        )
        == 4
    )
    assert f"{prefix}:character:narrator" not in nodes
    assert (
        len([node_id for node_id in nodes if node_id.startswith(f"{prefix}:keyframe:")])
        == 10
    )
    assert (
        len([node_id for node_id in nodes if node_id.startswith(f"{prefix}:video:")])
        == 10
    )

    keyframe_id = f"{prefix}:keyframe:1-1-01"
    video_id = f"{prefix}:video:1-1-01"
    assert edge_pairs[(location_id, keyframe_id)]["data"]["role"] == "scene_master"
    assert edge_pairs[(prop_ids[0], keyframe_id)]["data"]["role"] == "prop"
    assert edge_pairs[(location_id, video_id)]["data"]["role"] == "scene_master"
    assert edge_pairs[(prop_ids[0], video_id)]["data"]["role"] == "prop"
    assert nodes[video_id]["data"]["referenceOrder"] == [
        keyframe_id,
        location_id,
        *prop_ids,
    ]
    assert production_keyframe_is_approved(canvas, video_id) is False
    nodes[keyframe_id]["data"]["imageUrl"] = "/static/keyframe.png"
    assert production_keyframe_is_approved(canvas, video_id) is True


def test_reference_nodes_are_idempotent_and_package_urls_update_existing_nodes():
    raw = load_reference_fixture()
    package = parse_production_package(raw)
    first = build_canvas_from_package(package)
    prefix = "production:codex-bill-3000-v1"
    table_id = f"{prefix}:prop:wooden_table"
    phone_id = f"{prefix}:prop:black_phone"
    first_nodes = {node["id"]: node for node in first["nodes"]}
    first_nodes[table_id]["data"]["imageUrl"] = "/static/generated-table.png"
    first_nodes[table_id]["data"]["previewImageUrl"] = "/static/generated-table.png"
    first_nodes[table_id]["position"] = {"x": 123, "y": 456}

    for asset in raw["assets"]:
        if asset["id"] == "wooden_table":
            asset["generation_prompt"] = "更新后的木质餐桌提示词"
        if asset["id"] == "black_phone":
            asset["url"] = "/static/imported-phone.png"
    second = build_canvas_from_package(parse_production_package(raw), first)
    second_nodes = {node["id"]: node for node in second["nodes"]}

    assert len(second_nodes) == len(second["nodes"])
    assert second_nodes[table_id]["data"]["prompt"] == "更新后的木质餐桌提示词"
    assert second_nodes[table_id]["data"]["imageUrl"] == "/static/generated-table.png"
    assert second_nodes[table_id]["position"] == {"x": 123, "y": 456}
    assert second_nodes[phone_id]["data"]["imageUrl"] == "/static/imported-phone.png"
    assert second_nodes[phone_id]["data"]["productionStatus"] == "已导入"
    assert second_nodes[table_id]["data"]["version"] == 2
