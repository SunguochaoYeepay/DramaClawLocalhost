from __future__ import annotations

from novelvideo.director_world import staging_prop_ai


def test_generate_ai_staging_prop_uses_director_world_shape_hints(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_run_staging_prop_agent(request, **kwargs):
        captured.update(kwargs)
        captured["task"] = staging_prop_ai.build_user_prompt(request)
        return {
            "prop_id": "horse_mount",
            "name": "可骑的马",
            "semantic_label": "horse",
            "shape_hint": "quadruped_mount",
            "position": [1, 0, 2],
            "scale": [1.4, 1.25, 2.2],
            "relation_intent": "mount_actor",
        }

    monkeypatch.setattr(staging_prop_ai, "run_staging_prop_agent", fake_run_staging_prop_agent)

    result = staging_prop_ai.generate_ai_staging_prop(
        {
            "api_key": "test-key",
            "base_url": "http://example.test/v1",
            "model": "test-model",
            "scene_id": "面馆",
            "user_hint": "让男青年骑一匹马",
            "crosshair_target": {"position": [1, 0, 2]},
        }
    )

    assert result["ok"] is True
    assert result["model"] == "test-model"
    assert result["prop"]["shape_hint"] == "quadruped_mount"
    assert result["prop"]["attachment_points"][0]["kind"] == "mount"
    assert captured["model"] == "test-model"
    assert "让男青年骑一匹马" in captured["task"]


def test_generate_ai_staging_prop_falls_back_to_shape_hint_inference(monkeypatch) -> None:
    async def fake_run_staging_prop_agent(_request, **_kwargs):
        return {"name": "一匹马"}

    monkeypatch.setattr(staging_prop_ai, "run_staging_prop_agent", fake_run_staging_prop_agent)

    result = staging_prop_ai.generate_ai_staging_prop(
        {"api_key": "test-key", "user_hint": "让他骑马", "crosshair_target": {}}
    )

    assert result["prop"]["semantic_label"] == "horse"
    assert result["prop"]["shape_hint"] == "quadruped_mount"
    assert result["prop"]["relation_intent"] == "mount_actor"


def test_resolve_model_config_defaults_to_staging_prop_dc_alias(monkeypatch) -> None:
    monkeypatch.delenv("STAGING_PROP_MODEL", raising=False)

    model, _api_key, _base_url = staging_prop_ai.resolve_model_config({})

    assert model == "DC-staging-prop-planner-LLM"
