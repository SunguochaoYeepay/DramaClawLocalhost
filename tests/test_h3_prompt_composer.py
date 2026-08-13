from __future__ import annotations

import pytest

from novelvideo.generators.h3_prompt_composer import H3Reference, build_h3_prompt_draft


def test_h3_prompt_draft_preserves_reference_roles_and_continuity() -> None:
    prompt = build_h3_prompt_draft(
        creative_intent="主角在雨夜巷子里回头，镜头缓慢推进。",
        references=[
            H3Reference("image", "主角外观与起始构图"),
            H3Reference("image", "雨夜场景"),
            H3Reference("video", "手持跟拍运动"),
            H3Reference("audio", "环境声节奏"),
        ],
        primary_image_is_subject=True,
    )

    assert "@图片1作为主主体" in prompt
    assert "@图片2作为雨夜场景参考" in prompt
    assert "@视频1作为手持跟拍运动参考" in prompt
    assert "@音频1作为环境声节奏参考" in prompt
    assert "连续镜头" in prompt
    assert "幻灯片式切换" in prompt


@pytest.mark.asyncio
async def test_h3_prompt_skill_returns_editable_text_output(tmp_path, monkeypatch) -> None:
    from novelvideo.api.routes import freezone as routes
    from novelvideo.freezone.skill_registry import SkillRunRequest

    project_dir = tmp_path / "project"
    project_dir.mkdir()

    async def fake_resolve_project(*_args, **_kwargs):
        return None, "admin", "demo", project_dir, project_dir / "output"

    monkeypatch.setattr(routes, "_resolve_freezone_project", fake_resolve_project)
    monkeypatch.setattr(routes, "_append_canvas_event", lambda **_kwargs: None)

    result = await routes.freezone_skill_run(
        project="demo",
        skill_id="freezone.h3_prompt_composer",
        body=SkillRunRequest(
            skill_node_id="skill_h3",
            canvas_id="canvas_a",
            resolved_inputs=[
                {
                    "role": "creative_intent",
                    "node_id": "intent",
                    "node_type": "textAnnotationNode",
                    "media_kind": "text",
                    "text": "角色回头看向镜头。",
                },
                {
                    "role": "image_reference",
                    "node_id": "image_ref",
                    "node_type": "imageGenNode",
                    "media_kind": "image",
                    "image_url": "/static/projects/demo/ref.png",
                },
                {
                    "role": "video_reference",
                    "node_id": "video_ref",
                    "node_type": "videoNode",
                    "media_kind": "video",
                    "video_url": "/static/projects/demo/ref.mp4",
                },
                {
                    "role": "audio_reference",
                    "node_id": "audio_ref",
                    "node_type": "audioNode",
                    "media_kind": "audio",
                    "audio_url": "/static/projects/demo/ref.wav",
                },
            ],
        ),
        user={"username": "admin"},
    )

    assert result.status == "completed"
    metadata = routes._read_skill_run_metadata(project_dir, result.run_id)
    output = metadata["outputs"][0]
    assert output["role"] == "h3_video_prompt"
    assert output["media_type"] == "text"
    assert "@图片1" in output["text"]
    assert "@视频1" in output["text"]
    assert "@音频1" in output["text"]
