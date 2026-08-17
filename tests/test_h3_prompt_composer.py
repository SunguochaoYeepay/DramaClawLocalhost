from __future__ import annotations

import pytest

from novelvideo.generators.h3_prompt_composer import (
    H3PromptMode,
    H3Reference,
    build_h3_prompt_draft,
    compose_h3_prompt,
    infer_h3_prompt_mode,
    is_valid_h3_prompt_structure,
)


@pytest.mark.parametrize(
    ("mode", "references", "has_first_frame", "has_last_frame", "anchor"),
    [
        (H3PromptMode.T2VA, [], False, False, "Build the complete audiovisual timeline"),
        (
            H3PromptMode.I2VA,
            [H3Reference("image", "first-frame subject")],
            True,
            False,
            "<Picture 1> (from [Shot 1]) is fully referenced",
        ),
        (
            H3PromptMode.FL2VA,
            [H3Reference("image", "first frame")],
            True,
            True,
            "Picture 2 (from Shot 1) aligns with the 5.00-second mark",
        ),
        (
            H3PromptMode.L2VA,
            [],
            False,
            True,
            "<Picture 1> (from [Shot 1]) aligns with the 5.00-second mark",
        ),
    ],
)
def test_h3_base_modes_use_official_field_order(
    mode: H3PromptMode,
    references: list[H3Reference],
    has_first_frame: bool,
    has_last_frame: bool,
    anchor: str,
) -> None:
    prompt = build_h3_prompt_draft(
        creative_intent="The woman turns toward the camera and smiles.",
        references=references,
        mode=mode,
        has_first_frame=has_first_frame,
        has_last_frame=has_last_frame,
    )

    assert is_valid_h3_prompt_structure(prompt, mode)
    assert anchor in prompt
    assert prompt.index("integrated_multimodal_description:") < prompt.index(
        "overall_soundscape:"
    )
    assert prompt.index("overall_soundscape:") < prompt.index("non_diegetic_music:")


def test_h3_ref2va_prompt_preserves_reference_roles_and_continuity() -> None:
    references = [
        H3Reference("image", "primary subject identity and opening composition"),
        H3Reference("image", "rainy-night environment"),
        H3Reference("video", "handheld tracking motion"),
        H3Reference("audio", "ambient rhythm"),
    ]
    prompt = build_h3_prompt_draft(
        creative_intent="The subject turns around in a rainy alley as the camera pushes in.",
        references=references,
        primary_image_is_subject=True,
        mode=H3PromptMode.REF2VA,
    )

    assert is_valid_h3_prompt_structure(prompt, H3PromptMode.REF2VA)
    assert "<Picture 1> is used only for primary subject identity" in prompt
    assert "<Picture 2> is used only for rainy-night environment" in prompt
    assert "<Video 1> is used only for handheld tracking motion" in prompt
    assert "<Audio 1> is used only for ambient rhythm" in prompt
    assert "do not merge subjects or create a slideshow" in prompt


def test_h3_storyboard_prompt_can_use_simplified_chinese() -> None:
    prompt = build_h3_prompt_draft(
        creative_intent="女孩转身看向镜头并微笑。",
        references=[H3Reference("image", "镜头首帧")],
        mode=H3PromptMode.I2VA,
        has_first_frame=True,
        output_language="zh-CN",
    )

    assert is_valid_h3_prompt_structure(prompt, H3PromptMode.I2VA)
    assert "目标视频在 0.00 秒处完整参考 <Picture 1>" in prompt
    assert "保持人物身份、面部、服装、构图、光线和场景一致" in prompt
    assert "自然环境声和动作声与可见事件保持同步" in prompt
    assert "根据画面情绪加入克制的电影感纯音乐" in prompt
    assert "不含歌词、人声演唱、对白或旁白" in prompt
    assert "<d>" not in prompt


def test_h3_draft_leaves_dialogue_and_narration_for_manual_editing() -> None:
    prompt = build_h3_prompt_draft(
        creative_intent="女孩转身看向镜头并微笑。",
        context={"dialogue": "你好。", "narration": "她回过头。"},
        output_language="zh-CN",
    )

    assert "你好" not in prompt
    assert "她回过头" not in prompt
    assert "<d>" not in prompt
    assert "non_diegetic_music: 根据画面情绪" in prompt


@pytest.mark.asyncio
async def test_compose_h3_prompt_passes_language_to_draft(monkeypatch) -> None:
    import builtins

    real_import = builtins.__import__

    def fail_pydantic_ai_import(name, *args, **kwargs):
        if name == "pydantic_ai":
            raise ImportError("force deterministic draft")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fail_pydantic_ai_import)
    prompt = await compose_h3_prompt(
        creative_intent="女孩挥手微笑。",
        references=[H3Reference("image", "镜头首帧")],
        mode=H3PromptMode.I2VA,
        has_first_frame=True,
        output_language="zh-CN",
    )

    assert "目标视频在 0.00 秒处完整参考 <Picture 1>" in prompt
    assert "non_diegetic_music: 根据画面情绪" in prompt


def test_h3_mode_inference_covers_all_five_official_modes() -> None:
    assert infer_h3_prompt_mode() == H3PromptMode.T2VA
    assert infer_h3_prompt_mode(has_first_frame=True) == H3PromptMode.I2VA
    assert (
        infer_h3_prompt_mode(has_first_frame=True, has_last_frame=True)
        == H3PromptMode.FL2VA
    )
    assert infer_h3_prompt_mode(has_last_frame=True) == H3PromptMode.L2VA
    assert (
        infer_h3_prompt_mode([H3Reference("video", "camera motion")])
        == H3PromptMode.REF2VA
    )


@pytest.mark.asyncio
async def test_h3_prompt_skill_returns_editable_official_text_output(
    tmp_path, monkeypatch
) -> None:
    from novelvideo.api.routes import freezone as routes
    from novelvideo.freezone.skill_registry import SkillRunRequest
    from novelvideo.generators import h3_prompt_composer as composer_module

    project_dir = tmp_path / "project"
    project_dir.mkdir()

    async def fake_resolve_project(*_args, **_kwargs):
        return None, "admin", "demo", project_dir, project_dir / "output"

    monkeypatch.setattr(routes, "_resolve_freezone_project", fake_resolve_project)
    monkeypatch.setattr(routes, "_append_canvas_event", lambda **_kwargs: None)

    seen: dict[str, object] = {}

    async def fake_compose_h3_prompt(**kwargs):
        seen.update(kwargs)
        return build_h3_prompt_draft(**kwargs)

    monkeypatch.setattr(composer_module, "compose_h3_prompt", fake_compose_h3_prompt)

    result = await routes.freezone_skill_run(
        project="demo",
        skill_id="freezone.h3_prompt_composer",
        body=SkillRunRequest(
            skill_node_id="skill_h3",
            canvas_id="canvas_a",
            parameters={
                "mode": "ref2va",
                "duration_seconds": 8,
                "primary_image_is_subject": True,
                "has_last_frame": True,
                "output_language": "zh-CN",
            },
            resolved_inputs=[
                {
                    "role": "creative_intent",
                    "node_id": "intent",
                    "node_type": "textAnnotationNode",
                    "media_kind": "text",
                    "text": "The woman turns and looks toward the camera.",
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
    assert is_valid_h3_prompt_structure(output["text"], H3PromptMode.REF2VA)
    assert "<Picture 1>" in output["text"]
    assert "<Video 1>" in output["text"]
    assert "<Audio 1>" in output["text"]
    assert seen["mode"] == "ref2va"
    assert seen["duration_seconds"] == 8.0
    assert seen["primary_image_is_subject"] is True
    assert seen["has_last_frame"] is True
    assert seen["output_language"] == "zh-CN"
