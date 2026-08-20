"""MiniMax H3 prompt compiler based on the official prompt-writing skill."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Iterable

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

OFFICIAL_SKILL_URL = (
    "https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills/h3-prompt-writing"
)


class H3PromptMode(StrEnum):
    T2VA = "t2va"
    I2VA = "i2va"
    FL2VA = "fl2va"
    L2VA = "l2va"
    REF2VA = "ref2va"


class H3AudioMode(StrEnum):
    MOTION_ONLY = "motion_only"
    DIALOGUE_AUDIO_REFERENCE = "dialogue_audio_reference"


@dataclass(frozen=True)
class H3Reference:
    media_type: str
    label: str = ""


class _H3PromptComposerOutput(BaseModel):
    prompt: str = Field(default="")


_TAG_BY_MEDIA_TYPE = {"image": "Picture", "video": "Video", "audio": "Audio"}
_MODE_ALIASES = {
    "t2v": H3PromptMode.T2VA,
    "t2va": H3PromptMode.T2VA,
    "texttovideo": H3PromptMode.T2VA,
    "i2v": H3PromptMode.I2VA,
    "i2va": H3PromptMode.I2VA,
    "imagetovideo": H3PromptMode.I2VA,
    "flf": H3PromptMode.FL2VA,
    "fl2v": H3PromptMode.FL2VA,
    "fl2va": H3PromptMode.FL2VA,
    "firstlastframe": H3PromptMode.FL2VA,
    "l2v": H3PromptMode.L2VA,
    "l2va": H3PromptMode.L2VA,
    "lastframetovideo": H3PromptMode.L2VA,
    "r2v": H3PromptMode.REF2VA,
    "ref2v": H3PromptMode.REF2VA,
    "ref2va": H3PromptMode.REF2VA,
    "allreference": H3PromptMode.REF2VA,
}
_BASE_FIELDS = (
    "integrated_multimodal_description:",
    "overall_soundscape:",
    "non_diegetic_music:",
)
_REF_FIELDS = (
    "subject_definitions:",
    "summary:",
    "retention_analysis:",
    "detailed_description:",
    "overall_soundscape:",
    "non_diegetic_music:",
)


def _use_chinese(output_language: str | None) -> bool:
    return str(output_language or "").strip().lower().replace("_", "-").startswith("zh")


def _localized(output_language: str | None, english: str, chinese: str) -> str:
    return chinese if _use_chinese(output_language) else english


def _music_direction(output_language: str | None) -> str:
    return _localized(
        output_language,
        "Emotion-matched cinematic instrumental music supports the scene and evolves naturally with the action and camera movement. "
        "Use no lyrics, singing, spoken words, or voiceover, and mix the music below the natural ambience and any dialogue the user adds later.",
        "根据画面情绪加入克制的电影感纯音乐，节奏随人物动作和镜头变化自然推进。"
        "不含歌词、人声演唱、对白或旁白，配乐音量低于自然环境声及用户后续自行添加的对白。",
    )


def _normalized_references(references: Iterable[H3Reference]) -> list[H3Reference]:
    return [
        H3Reference(str(ref.media_type or "").strip().lower(), str(ref.label or "").strip())
        for ref in references
        if str(ref.media_type or "").strip().lower() in _TAG_BY_MEDIA_TYPE
    ]


def normalize_h3_prompt_mode(mode: str | H3PromptMode | None) -> H3PromptMode | None:
    if isinstance(mode, H3PromptMode):
        return mode
    key = "".join(ch for ch in str(mode or "").strip().lower() if ch.isalnum())
    return _MODE_ALIASES.get(key)


def normalize_h3_audio_mode(mode: str | H3AudioMode | None) -> H3AudioMode:
    if isinstance(mode, H3AudioMode):
        return mode
    if str(mode or "").strip().lower() == H3AudioMode.DIALOGUE_AUDIO_REFERENCE:
        return H3AudioMode.DIALOGUE_AUDIO_REFERENCE
    return H3AudioMode.MOTION_ONLY


def infer_h3_prompt_mode(
    references: Iterable[H3Reference] = (),
    *,
    mode: str | H3PromptMode | None = None,
    has_first_frame: bool | None = None,
    has_last_frame: bool = False,
) -> H3PromptMode:
    explicit = normalize_h3_prompt_mode(mode)
    if explicit is not None:
        return explicit

    refs = _normalized_references(references)
    image_count = sum(ref.media_type == "image" for ref in refs)
    has_multimodal_reference = any(ref.media_type != "image" for ref in refs)
    first = image_count > 0 if has_first_frame is None else bool(has_first_frame)
    if has_multimodal_reference or image_count > (1 if first else 0):
        return H3PromptMode.REF2VA
    if first and has_last_frame:
        return H3PromptMode.FL2VA
    if has_last_frame:
        return H3PromptMode.L2VA
    if first:
        return H3PromptMode.I2VA
    return H3PromptMode.T2VA


def _duration_text(duration_seconds: float) -> str:
    return f"{min(15.0, max(4.0, float(duration_seconds))):.2f}"


def _reference_manifest(
    references: list[H3Reference],
    output_language: str | None = None,
) -> list[dict[str, str]]:
    counters = {"image": 0, "video": 0, "audio": 0}
    manifest: list[dict[str, str]] = []
    for reference in references:
        counters[reference.media_type] += 1
        manifest.append(
            {
                "label": f"<{_TAG_BY_MEDIA_TYPE[reference.media_type]} {counters[reference.media_type]}>",
                "media_type": reference.media_type,
                "role": reference.label
                or _localized(output_language, "auxiliary reference", "辅助参考"),
            }
        )
    return manifest


def _base_instruction(
    mode: H3PromptMode,
    duration: str,
    output_language: str | None = None,
) -> str:
    if mode == H3PromptMode.I2VA:
        return _localized(
            output_language,
            "For the target video, at 0.00 seconds into the target video, "
            "<Picture 1> (from [Shot 1]) is fully referenced.",
            "目标视频在 0.00 秒处完整参考 <Picture 1>（来自 [Shot 1]）。",
        )
    if mode == H3PromptMode.FL2VA:
        return _localized(
            output_language,
            "How the reference pictures align with the target video — Picture 1 "
            "(from Shot 1) aligns with the 0.00-second mark of the target video; "
            f"Picture 2 (from Shot 1) aligns with the {duration}-second mark of the target video.",
            "参考图片与目标视频的时间对齐关系：Picture 1（来自 Shot 1）对应目标视频 "
            f"0.00 秒；Picture 2（来自 Shot 1）对应目标视频 {duration} 秒。",
        )
    if mode == H3PromptMode.L2VA:
        return _localized(
            output_language,
            "How the reference pictures align with the target video — <Picture 1> "
            f"(from [Shot 1]) aligns with the {duration}-second mark of the target video.",
            f"参考图片与目标视频的时间对齐关系：<Picture 1>（来自 [Shot 1]）对应目标视频 {duration} 秒。",
        )
    return ""


def _context_description(context: dict[str, Any] | None) -> str:
    values: list[str] = []
    for key in ("visual_description", "scene_description"):
        value = str((context or {}).get(key) or "").strip()
        if value:
            values.append(value)
    return " ".join(values)


def build_h3_prompt_draft(
    *,
    creative_intent: str,
    references: Iterable[H3Reference] = (),
    primary_image_is_subject: bool = False,
    context: dict[str, Any] | None = None,
    mode: str | H3PromptMode | None = None,
    duration_seconds: float = 5,
    has_first_frame: bool | None = None,
    has_last_frame: bool = False,
    output_language: str = "en",
    audio_mode: str | H3AudioMode | None = None,
) -> str:
    """Build an editable prompt that follows the official H3 section order."""
    refs = _normalized_references(references)
    resolved_mode = infer_h3_prompt_mode(
        refs,
        mode=mode,
        has_first_frame=has_first_frame,
        has_last_frame=has_last_frame,
    )
    duration = _duration_text(duration_seconds)
    intent = str(creative_intent or "").strip()
    visual_context = _context_description(context)
    action = " ".join(part for part in (visual_context, intent) if part).strip()
    if not action:
        action = _localized(
            output_language,
            "The subject performs the requested action in one coherent shot.",
            "主体在一个连贯镜头中完成指定动作。",
        )

    manifest = _reference_manifest(refs, output_language)
    if resolved_mode == H3PromptMode.REF2VA:
        resolved_audio_mode = normalize_h3_audio_mode(audio_mode)
        audio_manifest = [item for item in manifest if item["media_type"] == "audio"]
        definitions = "; ".join(
            _localized(
                output_language,
                f"{item['label']} is used only for {item['role']}",
                f"{item['label']} 仅用于{item['role']}",
            )
            for item in manifest
        ) or _localized(
            output_language,
            "No external reference labels were supplied.",
            "未提供外部参考标签。",
        )
        retention = _localized(
            output_language,
            "Preserve the primary subject identity, face, clothing, scene geometry, and reference hierarchy. "
            "Transfer only the declared role of each auxiliary reference; do not merge subjects or create a slideshow.",
            "保持主要人物身份、面部、服装、场景几何关系和参考层级。每个辅助参考仅传递其指定作用；"
            "不要合并人物，也不要生成幻灯片式画面。",
        )
        detailed = " ".join(
            part
            for part in (
                _localized(
                    output_language,
                    f"[Shot 1] Live-action, a continuous shot lasting {duration} seconds.",
                    f"[Shot 1] 真人实拍，一个持续 {duration} 秒的连续镜头。",
                ),
                action,
                _localized(
                    output_language,
                    "Camera movement, physical action, and sound remain temporally synchronized.",
                    "镜头运动、人物动作和声音在时间上保持同步。",
                ),
            )
            if part
        )
        if (
            resolved_audio_mode == H3AudioMode.DIALOGUE_AUDIO_REFERENCE
            and len(audio_manifest) == 1
        ):
            dialogue_audio = audio_manifest[0]["label"]
            definitions = f"{definitions}; " + _localized(
                output_language,
                f"{dialogue_audio} is the exact spoken performance for the designated on-screen speaker",
                f"{dialogue_audio} 是指定出镜人物的准确对白表演",
            )
            summary = _localized(
                output_language,
                f"The designated speaker says the exact words with the exact timing of {dialogue_audio}; "
                "all other people remain silent and react naturally. " + action,
                f"指定人物严格按照 {dialogue_audio} 的原始台词和时间说话；其他人物保持沉默并自然反应。{action}",
            )
            retention = _localized(
                output_language,
                "Preserve identity, face, wardrobe, scene, and composition. Do not add, remove, translate, "
                "rewrite, or replace any spoken words, and do not make another person speak.",
                "保持人物身份、面部、服装、场景和构图。不得新增、删减、翻译、改写或替换任何台词，"
                "不得让其他人物开口说话。",
            )
            detailed = " ".join(
                (
                    _localized(
                        output_language,
                        f"[Shot 1] Live-action, a continuous shot lasting {duration} seconds.",
                        f"[Shot 1] 真人实拍，一个持续 {duration} 秒的连续镜头。",
                    ),
                    action,
                    _localized(
                        output_language,
                        f"The designated speaker's lip shapes, jaw movement, breath pauses, facial expression, "
                        f"and subtle head motion stay synchronized to {dialogue_audio} throughout the shot.",
                        f"指定人物的唇形、下颌动作、呼吸停顿、面部表情和细微头部动作在整个镜头中与 {dialogue_audio} 同步。",
                    ),
                )
            )
            return "\n".join(
                (
                    f"subject_definitions: {definitions}",
                    f"summary: {summary}",
                    f"retention_analysis: {retention}",
                    f"detailed_description: {detailed}",
                    "overall_soundscape: "
                    + _localized(
                        output_language,
                        f"Preserve {dialogue_audio} as the primary spoken soundtrack. Add only quiet room tone; "
                        "no additional speech, narration, singing, lyrics, or sound that masks the dialogue.",
                        f"保留 {dialogue_audio} 作为主要对白音轨。只添加轻微环境底噪；不得添加其他对白、旁白、"
                        "演唱、歌词或遮盖对白的声音。",
                    ),
                    "non_diegetic_music: None.",
                )
            )
        return "\n".join(
            (
                f"subject_definitions: {definitions}",
                f"summary: {action}",
                f"retention_analysis: {retention}",
                f"detailed_description: {detailed}",
                "overall_soundscape: "
                + _localized(
                    output_language,
                    "Natural ambience and physical action sounds remain synchronized with the visible events.",
                    "自然环境声和动作声与可见事件保持同步。",
                ),
                "non_diegetic_music: "
                + _music_direction(output_language),
            )
        )

    anchor = {
        H3PromptMode.T2VA: _localized(
            output_language,
            "Build the complete audiovisual timeline from the description.",
            "根据描述构建完整的视听时间线。",
        ),
        H3PromptMode.I2VA: _localized(
            output_language,
            "Begin from <Picture 1>, preserving its subject identity, face, clothing, composition, lighting, and scene.",
            "从 <Picture 1> 开始，保持人物身份、面部、服装、构图、光线和场景一致。",
        ),
        H3PromptMode.FL2VA: _localized(
            output_language,
            "Begin exactly from Picture 1 and describe observable continuous motion that reaches Picture 2 at the final moment.",
            "严格从 Picture 1 开始，描述清晰可见的连续运动，并在最后一刻准确到达 Picture 2。",
        ),
        H3PromptMode.L2VA: _localized(
            output_language,
            "Infer a plausible earlier state and converge continuously to the exact composition of <Picture 1> at the final moment.",
            "推断合理的前置状态，并通过连续运动在最后一刻准确收束到 <Picture 1> 的构图。",
        ),
    }[resolved_mode]
    body = " ".join(
        part
        for part in (
            _localized(
                output_language,
                f"[Shot 1] Live-action, a continuous shot lasting {duration} seconds.",
                f"[Shot 1] 真人实拍，一个持续 {duration} 秒的连续镜头。",
            ),
            anchor,
            action,
            _localized(
                output_language,
                "The camera movement uses a concrete motion type, amplitude, and speed, and the shot resolves within the requested duration.",
                "镜头运动应明确说明运动类型、幅度和速度，并在指定时长内完成收束。",
            ),
        )
        if part
    )
    fields = "\n".join(
        (
            f"integrated_multimodal_description: {body}",
            "overall_soundscape: "
            + _localized(
                output_language,
                "Natural ambience and physical action sounds remain synchronized with the visible events.",
                "自然环境声和动作声与可见事件保持同步。",
            ),
            "non_diegetic_music: " + _music_direction(output_language),
        )
    )
    instruction = _base_instruction(resolved_mode, duration, output_language)
    return f"{instruction}\n\n{fields}" if instruction else fields


def _strip_markdown_fence(prompt: str) -> str:
    text = str(prompt or "").strip()
    if text.startswith("```") and text.endswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            return "\n".join(lines[1:-1]).strip()
    return text


def is_valid_h3_prompt_structure(prompt: str, mode: str | H3PromptMode) -> bool:
    text = _strip_markdown_fence(prompt)
    resolved_mode = normalize_h3_prompt_mode(mode) or H3PromptMode.T2VA
    fields = _REF_FIELDS if resolved_mode == H3PromptMode.REF2VA else _BASE_FIELDS
    positions = [text.find(field) for field in fields]
    return all(position >= 0 for position in positions) and positions == sorted(positions)


def is_valid_h3_dialogue_audio_prompt(prompt: str) -> bool:
    text = _strip_markdown_fence(prompt)
    return bool(
        is_valid_h3_prompt_structure(text, H3PromptMode.REF2VA)
        and "<Audio 1>" in text
        and "non_diegetic_music: None" in text
        and ("lip" in text.lower() or "唇形" in text)
        and ("exact spoken" in text.lower() or "准确对白" in text or "原始台词" in text)
    )


async def compose_h3_prompt(
    *,
    creative_intent: str,
    references: Iterable[H3Reference] = (),
    primary_image_is_subject: bool = False,
    context: dict[str, Any] | None = None,
    mode: str | H3PromptMode | None = None,
    duration_seconds: float = 5,
    has_first_frame: bool | None = None,
    has_last_frame: bool = False,
    output_language: str = "en",
    audio_mode: str | H3AudioMode | None = None,
) -> str:
    """Compile an official-format draft and optionally refine it through the text gateway."""
    normalized_refs = _normalized_references(references)
    resolved_mode = infer_h3_prompt_mode(
        normalized_refs,
        mode=mode,
        has_first_frame=has_first_frame,
        has_last_frame=has_last_frame,
    )
    draft = build_h3_prompt_draft(
        creative_intent=creative_intent,
        references=normalized_refs,
        primary_image_is_subject=primary_image_is_subject,
        context=context,
        mode=resolved_mode,
        duration_seconds=duration_seconds,
        has_first_frame=has_first_frame,
        has_last_frame=has_last_frame,
        output_language=output_language,
        audio_mode=audio_mode,
    )
    try:
        from pydantic_ai import Agent

        from novelvideo.config import get_newapi_text_pydantic_model

        language_instruction = _localized(
            output_language,
            "Write all readable visual, action, camera, and sound descriptions in English. Preserve only field names, "
            "<Picture N>/<Video N>/<Audio N>, [Shot N], timestamps, and control labels verbatim. ",
            "所有可读的画面、动作、运镜和声音描述必须使用简体中文。仅保留原样的字段名、"
            "<Picture N>/<Video N>/<Audio N>、[Shot N]、时间戳和控制标签。",
        )
        prompt_context = {
            key: value
            for key, value in (context or {}).items()
            if key not in {"dialogue", "narration"}
        }
        resolved_audio_mode = normalize_h3_audio_mode(audio_mode)
        sound_instruction = (
            "Treat the single <Audio 1> as the designated speaker's exact dialogue performance. "
            "Synchronize lip shapes, jaw motion, breaths, expression, and subtle head motion to it. "
            "Do not add, remove, translate, rewrite, or replace speech; keep all other people silent. "
            "Set non_diegetic_music to None. "
            if resolved_audio_mode == H3AudioMode.DIALOGUE_AUDIO_REFERENCE
            else "Always write scene-appropriate instrumental music in non_diegetic_music, evolving with the action and camera. "
            "Do not add dialogue, narration, voiceover, spoken words, singing, lyrics, or <d> tags; the user will add speech manually. "
        )
        task = (
            "Rewrite the supplied MiniMax H3 request using the official h3-prompt-writing skill rules.\n"
            f"Official skill: {OFFICIAL_SKILL_URL}\n"
            f"Mode: {resolved_mode.value}; duration: {_duration_text(duration_seconds)} seconds.\n"
            f"{language_instruction} "
            "Preserve exact field names and section order. Use [Shot N] and exact cut timestamps. "
            "For camera movement specify motion type, amplitude, and speed. Keep every reference label stable and resolved. "
            f"{sound_instruction}"
            "Return only the final prompt, without Markdown fences or explanation.\n\n"
            + json.dumps(
                {
                    "mode": resolved_mode.value,
                    "duration_seconds": float(duration_seconds),
                    "audio_mode": resolved_audio_mode.value,
                    "asset_manifest": _reference_manifest(
                        normalized_refs,
                        output_language,
                    ),
                    "creative_intent": creative_intent,
                    "context": prompt_context,
                    "official_format_draft": draft,
                },
                ensure_ascii=False,
            )
        )
        agent = Agent(
            get_newapi_text_pydantic_model("MINIMAX_H3_PROMPT_COMPOSER_MODEL", "qwen-max"),
            output_type=_H3PromptComposerOutput,
            output_retries=1,
            name="MiniMax H3 Official Prompt Compiler",
        )
        result = await agent.run(task)
        refined = _strip_markdown_fence(result.output.prompt)
        refined_is_valid = is_valid_h3_prompt_structure(refined, resolved_mode)
        if resolved_audio_mode == H3AudioMode.DIALOGUE_AUDIO_REFERENCE:
            refined_is_valid = refined_is_valid and is_valid_h3_dialogue_audio_prompt(refined)
        if refined_is_valid:
            return refined
        logger.warning("H3 prompt compiler returned invalid section structure; using draft")
    except Exception:
        logger.warning("H3 prompt compiler unavailable; using deterministic draft", exc_info=True)
    return draft
