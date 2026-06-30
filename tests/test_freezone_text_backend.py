from __future__ import annotations

from pathlib import Path
import json

import pytest

from novelvideo.api.routes import freezone as freezone_routes
from novelvideo.api.schemas import FreezoneStoryScriptGenerateData, FreezoneStoryScriptRow
from novelvideo.freezone.text_node import (
    FREEZONE_TRANSLATION_MODEL,
    FREEZONE_TRANSLATION_PROVIDER,
    FreezoneTranslationResult,
    build_freezone_story_script_task,
    build_freezone_translation_task,
    translate_freezone_text,
)


def _patch_project_resolution(
    monkeypatch: pytest.MonkeyPatch,
    project_dir: Path,
    *,
    username: str = "admin",
):
    async def _fake_resolve(project: str, user: dict, *, required_role: str = "editor"):
        del user, required_role
        return None, username, project, project_dir, str(project_dir)

    monkeypatch.setattr(freezone_routes, "_resolve_freezone_project", _fake_resolve)


def test_build_freezone_translation_task_mentions_languages_and_node_type() -> None:
    task = build_freezone_translation_task(
        text="手持镜头，雨夜街头，人物缓慢向前走。",
        node_type="video",
    )

    assert "视频节点提示词" in task
    assert "Simplified Chinese" in task
    assert "English" in task
    assert "You must decide whether the dominant natural language" in task
    assert "手持镜头" in task


@pytest.mark.asyncio
async def test_translate_freezone_text_trusts_model_detected_direction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    class FakeAgent:
        async def run(self, task: str):
            captured["task"] = task

            class Response:
                output = FreezoneTranslationResult(
                    translated_text="生成一个 NovelVideo 节拍的故事板草图面板。",
                    source_language="en",
                    target_language="zh",
                )

            return Response()

    monkeypatch.setattr("novelvideo.freezone.text_node.get_freezone_translation_agent", FakeAgent)

    translated, source_language, target_language = await translate_freezone_text(
        text="Generate ONE storyboard sketch panel for this NovelVideo beat. 颜色法则：保留 [CM_6932]",
        node_type="image",
    )

    assert "You must decide whether the dominant natural language" in captured["task"]
    assert "[CM_6932]" in captured["task"]
    assert translated == "生成一个 NovelVideo 节拍的故事板草图面板。"
    assert source_language == "en"
    assert target_language == "zh"


@pytest.mark.asyncio
async def test_translate_freezone_text_flips_invalid_same_language_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAgent:
        async def run(self, _task: str):
            class Response:
                output = FreezoneTranslationResult(
                    translated_text="雨夜街头",
                    source_language="zh",
                    target_language="zh",
                )

            return Response()

    monkeypatch.setattr("novelvideo.freezone.text_node.get_freezone_translation_agent", FakeAgent)

    translated, source_language, target_language = await translate_freezone_text(
        text="雨夜街头",
        node_type="image",
    )

    assert translated == "雨夜街头"
    assert source_language == "zh"
    assert target_language == "en"


def test_translation_defaults_use_newapi_gemini_flash() -> None:
    assert FREEZONE_TRANSLATION_PROVIDER == "newapi"
    assert FREEZONE_TRANSLATION_MODEL == "gemini-3.5-flash"


def test_build_freezone_story_script_task_mentions_required_columns() -> None:
    task = build_freezone_story_script_task(
        source_text="沈昭昭在深夜办公室醒来。",
        prompt="节奏要快，压迫感强",
    )

    assert "镜号" in task
    assert "画面描述" in task
    assert "视频运动提示词" in task
    assert "角色图1" in task
    assert "沈昭昭" in task
    assert "节奏要快" in task
    assert "括号分段" in task
    assert "分镜提示词必须像高质量图像生成提示词" in task
    assert "最好严格按 8 段写" in task
    assert "最好严格按 6 段写" in task
    assert "第二段尽量直接使用或轻改角色描述1" in task
    assert "技术参数段尽量保留" in task


@pytest.mark.asyncio
async def test_freezone_text_translate_route_returns_task_id(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    _patch_project_resolution(monkeypatch, project_dir)
    captured: dict[str, object] = {}

    def _fake_start_text_translate_task(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(
        freezone_routes, "_start_freezone_text_translate_task", _fake_start_text_translate_task
    )

    result = await freezone_routes.freezone_text_translate(
        project="58",
        body=freezone_routes.FreezoneTextTranslateRequest(
            text="电影感特写，雨夜街头",
            node_type="image",
        ),
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["task_type"] == "freezone_text_translate"
    assert captured["text"] == "电影感特写，雨夜街头"
    assert captured["node_type"] == "image"


@pytest.mark.asyncio
async def test_freezone_image_reverse_prompt_route_returns_task_id(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    source = project_dir / "freezone" / "_uploads" / "sample.png"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(b"fake")

    _patch_project_resolution(monkeypatch, project_dir)
    captured: dict[str, object] = {}

    def _fake_start_image_reverse_prompt_task(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(
        freezone_routes,
        "_start_freezone_image_reverse_prompt_task",
        _fake_start_image_reverse_prompt_task,
    )

    result = await freezone_routes.freezone_image_reverse_prompt(
        project="58",
        body=freezone_routes.FreezoneImageReversePromptRequest(
            source_url="/static/admin/58/freezone/_uploads/sample.png"
        ),
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["task_type"] == "freezone_image_reverse_prompt"
    assert captured["source_path"] == source


@pytest.mark.asyncio
async def test_freezone_story_script_route_uses_source_text(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    _patch_project_resolution(monkeypatch, project_dir)
    captured: dict[str, object] = {}

    def _fake_start_story_script_task(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(
        freezone_routes, "_start_freezone_story_script_task", _fake_start_story_script_task
    )

    result = await freezone_routes.freezone_story_script_generate(
        project="58",
        body=freezone_routes.FreezoneStoryScriptGenerateRequest(
            source_text="沈昭昭在深夜办公室醒来。"
        ),
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["task_type"] == "freezone_story_script"
    assert captured["source_text"] == "沈昭昭在深夜办公室醒来。"
    assert captured["prompt"] == "根据我上传的剧本生成一个完整的故事脚本"
    assert captured["model"] == "newapi_gemini_flash"


@pytest.mark.asyncio
async def test_freezone_story_script_route_reads_source_url_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    source = project_dir / "freezone" / "_uploads" / "script.txt"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_text("沈昭昭在深夜办公室醒来。", encoding="utf-8")

    _patch_project_resolution(monkeypatch, project_dir)
    monkeypatch.setattr(
        freezone_routes,
        "resolve_static_url_to_path",
        lambda *_args, **_kwargs: source,
    )
    captured: dict[str, object] = {}

    def _fake_start_story_script_task(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(
        freezone_routes, "_start_freezone_story_script_task", _fake_start_story_script_task
    )

    result = await freezone_routes.freezone_story_script_generate(
        project="58",
        body=freezone_routes.FreezoneStoryScriptGenerateRequest(
            source_url="/static/admin/58/freezone/_uploads/script.txt"
        ),
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["task_type"] == "freezone_story_script"
    assert captured["source_text"] == "沈昭昭在深夜办公室醒来。"


@pytest.mark.asyncio
async def test_freezone_story_script_job_result_returns_json_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    job_id = "storyjob1"
    out = project_dir / "freezone" / "_outputs" / "freezone_story_script" / f"{job_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "title": "我在盛唐写天下",
        "rows": [
            {
                "shot_no": 1,
                "duration": 4,
                "visual_description": "现代深夜，沈昭昭在办公室过度劳累加班。",
                "character_1": "",
                "character_description_1": "",
                "character_image_1": "",
                "reference": "",
                "shot": "",
                "character_action": "",
                "emotion": "",
                "scene_tags": "",
                "lighting_mood": "",
                "sound": "",
                "dialogue": "",
                "shot_prompt": "近景特写",
                "video_motion_prompt": "缓慢推进",
            }
        ],
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    class FakeManager:
        def get_task(self, *args, **kwargs):
            return None

    _patch_project_resolution(monkeypatch, project_dir)
    monkeypatch.setattr(freezone_routes, "get_task_manager", lambda: FakeManager())

    result = await freezone_routes.freezone_job_result(
        project="58",
        task_type="freezone_story_script",
        job_id=job_id,
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["title"] == "我在盛唐写天下"
    assert result["data"]["rows"][0]["shot_no"] == 1


@pytest.mark.asyncio
async def test_freezone_text_translate_job_result_returns_json_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    job_id = "translatejob1"
    out = project_dir / "freezone" / "_outputs" / "freezone_text_translate" / f"{job_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "translated_text": "Today is Monday",
        "source_language": "zh",
        "target_language": "en",
        "node_type": "generic",
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    class FakeManager:
        def get_task(self, *args, **kwargs):
            return None

    _patch_project_resolution(monkeypatch, project_dir)
    monkeypatch.setattr(freezone_routes, "get_task_manager", lambda: FakeManager())

    result = await freezone_routes.freezone_job_result(
        project="58",
        task_type="freezone_text_translate",
        job_id=job_id,
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["translated_text"] == "Today is Monday"
    assert result["data"]["target_language"] == "en"


@pytest.mark.asyncio
async def test_freezone_image_reverse_prompt_job_result_returns_json_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_dir = tmp_path / "project"
    job_id = "reverseprompt1"
    out = project_dir / "freezone" / "_outputs" / "freezone_image_reverse_prompt" / f"{job_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "prompt": "雨夜街头，电影感近景特写，人物侧脸被霓虹照亮",
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    class FakeManager:
        def get_task(self, *args, **kwargs):
            return None

    _patch_project_resolution(monkeypatch, project_dir)
    monkeypatch.setattr(freezone_routes, "get_task_manager", lambda: FakeManager())

    result = await freezone_routes.freezone_job_result(
        project="58",
        task_type="freezone_image_reverse_prompt",
        job_id=job_id,
        user={"username": "admin"},
    )

    assert result["ok"] is True
    assert result["data"]["prompt"].startswith("雨夜街头")
