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


def test_preview_preserves_story_counts_and_audio():
    package = parse_production_package(load_fixture())
    summary = package_preview(package)
    assert summary["project_title"] == "藏在账单里的三千块"
    assert summary["scene_count"] == 5
    assert summary["shot_count"] == 5
    assert summary["character_count"] == 5
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
    second_keyframe = next(node for node in second["nodes"] if node["id"] == keyframe_id)
    assert second_keyframe["data"]["imageUrl"] == "/static/frame.png"
    assert second_keyframe["data"]["reviewStatus"] == "approved"
    edge_pairs = {(edge["source"], edge["target"]) for edge in second["edges"]}
    assert ("production:codex-bill-3000-v1:script", "production:codex-bill-3000-v1:scene:1-1") in edge_pairs
    assert ("production:codex-bill-3000-v1:shot:1-1-01", keyframe_id) in edge_pairs
    assert (keyframe_id, "production:codex-bill-3000-v1:video:1-1-01") in edge_pairs
    video_id = "production:codex-bill-3000-v1:video:1-1-01"
    assert production_keyframe_is_approved(second, video_id) is True


def test_video_is_blocked_until_keyframe_exists_and_preserves_failure():
    package = parse_production_package(load_fixture())
    canvas = build_canvas_from_package(package)
    video_id = "production:codex-bill-3000-v1:video:1-1-01"
    assert production_keyframe_is_approved(canvas, video_id) is False
    keyframe = next(node for node in canvas["nodes"] if ":keyframe:1-1-01" in node["id"])
    keyframe["data"].update({"imageUrl": "/frame.png", "reviewStatus": "pending", "generationError": "old failure"})
    assert production_keyframe_is_approved(canvas, video_id) is True
    reimported = build_canvas_from_package(package, canvas)
    assert next(node for node in reimported["nodes"] if node["id"] == keyframe["id"])["data"]["generationError"] == "old failure"


def test_validation_reports_nested_field_path():
    raw = load_fixture()
    del raw["scenes"][0]["shots"][0]["keyframe_prompt"]
    with pytest.raises(ValidationError) as exc_info:
        parse_production_package(raw)
    errors = package_validation_errors(exc_info.value)
    assert any(error["field"] == "scenes.0.shots.0.keyframe_prompt" for error in errors)
