import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.m04


def _client():
    from novelvideo.api.routes import styles

    app = FastAPI()
    app.include_router(styles.router)
    app.dependency_overrides[styles.get_api_user] = lambda: {"username": "alice"}
    return TestClient(app)


def test_style_preview_get_returns_image_without_generation():
    response = _client().get("/styles/anime/preview")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_style_preview_post_route_still_exists(monkeypatch, tmp_path):
    from novelvideo.generators import image_generator

    preview_path = tmp_path / "preview.png"
    preview_path.write_bytes(b"\x89PNG\r\n\x1a\n")

    async def fake_generate_character_reference_unified(**kwargs):
        return [str(preview_path)]

    monkeypatch.setattr(
        image_generator,
        "generate_character_reference_unified",
        fake_generate_character_reference_unified,
    )

    response = _client().post("/styles/anime/preview", json={})

    assert response.status_code == 200


def test_guoman_fantasy_is_listed_as_3d_animation_preset():
    response = _client().get("/styles")

    assert response.status_code == 200
    styles = response.json()["data"]
    guoman = next(style for style in styles if style["id"] == "guoman_fantasy")
    assert guoman["label"] == "3D玄幻国漫"
    assert guoman["style_family"] == "animation"
    assert guoman["animation_subtype"] == "3d"


def test_create_style_accepts_frontend_payload_with_top_level_id_and_name(monkeypatch, tmp_path):
    from novelvideo.api.deps import ProjectResolution
    from novelvideo.api.routes import styles
    from novelvideo.services.style_service import StyleService

    saved = []

    async def fake_resolve_project_scope(project, user, *, required_role="viewer"):
        assert project == "demo"
        assert user == {"username": "alice"}
        assert required_role == "editor"
        return ProjectResolution(
            ctx=None,
            username="alice",
            project_name="demo",
            project_dir=tmp_path,
            output_dir=str(tmp_path),
            state_dir=str(tmp_path / "state"),
            runtime_dir=str(tmp_path / "runtime"),
        )

    def fake_save_custom_style(style_id, config, **kwargs):
        saved.append((style_id, config, kwargs))
        return True

    monkeypatch.setattr(styles, "resolve_project_scope", fake_resolve_project_scope)
    monkeypatch.setattr(StyleService, "save_custom_style", fake_save_custom_style)

    response = _client().post(
        "/styles",
        json={
            "id": "custom_drama",
            "name": "自定义剧集风格",
            "project": "demo",
            "config": {
                "label": "自定义剧集风格",
                "style_instructions": "cinematic live action",
                "avoid_instructions": "anime",
                "style_tag": "LIVE-ACTION",
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert len(saved) == 1
    style_id, config, kwargs = saved[0]
    assert style_id == "custom_drama"
    assert config.id == "custom_drama"
    assert config.name == "自定义剧集风格"
    assert config.label == "自定义剧集风格"
    assert kwargs == {"username": "alice", "project": "demo"}


def test_config_style_helpers_do_not_fallback_to_hardcoded_presets(monkeypatch):
    from novelvideo import config

    class BrokenStyleService:
        @staticmethod
        def get_style(*args, **kwargs):
            raise RuntimeError("style service unavailable")

        @staticmethod
        def get_style_labels(*args, **kwargs):
            raise RuntimeError("style service unavailable")

        @staticmethod
        def list_all_styles(*args, **kwargs):
            raise RuntimeError("style service unavailable")

    real_import = __import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "novelvideo.services.style_service":

            class Module:
                StyleService = BrokenStyleService

            return Module
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", fake_import)

    with pytest.raises(RuntimeError, match="style service unavailable"):
        config.get_style_preset("chinese_period_drama")
    with pytest.raises(RuntimeError, match="style service unavailable"):
        config.get_style_labels()
    with pytest.raises(RuntimeError, match="style service unavailable"):
        config.list_available_styles()
