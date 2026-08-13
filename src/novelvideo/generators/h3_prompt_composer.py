"""Shared prompt composition for MiniMax H3 reference-to-video workflows."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Iterable

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class H3Reference:
    media_type: str
    label: str = ""


class _H3PromptComposerOutput(BaseModel):
    prompt: str = Field(default="")


_TAG_BY_MEDIA_TYPE = {"image": "@图片", "video": "@视频", "audio": "@音频"}
_MANIFEST_TYPE_BY_MEDIA_TYPE = {"image": "图片", "video": "视频", "audio": "音频"}


def _normalized_references(references: Iterable[H3Reference]) -> list[H3Reference]:
    return [
        H3Reference(str(ref.media_type or "").strip().lower(), str(ref.label or "").strip())
        for ref in references
        if str(ref.media_type or "").strip().lower() in _TAG_BY_MEDIA_TYPE
    ]


def build_h3_prompt_draft(
    *,
    creative_intent: str,
    references: Iterable[H3Reference] = (),
    primary_image_is_subject: bool = False,
    context: dict[str, Any] | None = None,
) -> str:
    """Build a deterministic, editable H3 prompt with explicit reference roles."""
    counters = {"image": 0, "video": 0, "audio": 0}
    parts: list[str] = []
    for reference in _normalized_references(references):
        media_type = reference.media_type
        counters[media_type] += 1
        tag = f"{_TAG_BY_MEDIA_TYPE[media_type]}{counters[media_type]}"
        label = reference.label or {"image": "辅助视觉元素", "video": "动作与运镜", "audio": "声音节奏与氛围"}[media_type]
        if media_type == "image" and counters[media_type] == 1 and primary_image_is_subject:
            parts.append(f"{tag}作为主主体与起始构图，保持其人物身份、面部、服装和画面风格一致。")
        elif media_type == "image":
            parts.append(f"{tag}作为{label}参考，只继承与该素材相关的外观、道具、场景或风格，不要替换或混合主主体。")
        elif media_type == "video":
            parts.append(f"{tag}作为{label}参考，继承其动作节奏、镜头运动或表演方式。")
        else:
            parts.append(f"{tag}作为{label}参考，画面动作与节奏自然贴合其声音内容。")

    if str(creative_intent or "").strip():
        parts.append(f"创作意图：{str(creative_intent).strip()}")
    if context:
        for key, label in (("visual_description", "画面动作与事件"), ("scene_description", "场景环境"), ("narration", "镜头内容围绕")):
            value = str(context.get(key) or "").strip()
            if value:
                parts.append(f"{label}：{value}。")
    parts.append("保持一个连续镜头和连贯的人物、物体、光线与镜头运动；不要制作幻灯片式切换、硬切、定格或无关元素突然替换。")
    return "".join(parts)


async def compose_h3_prompt(
    *,
    creative_intent: str,
    references: Iterable[H3Reference] = (),
    primary_image_is_subject: bool = False,
    context: dict[str, Any] | None = None,
) -> str:
    """Refine the deterministic draft when the optional text gateway is online."""
    normalized_refs = _normalized_references(references)
    draft = build_h3_prompt_draft(
        creative_intent=creative_intent,
        references=normalized_refs,
        primary_image_is_subject=primary_image_is_subject,
        context=context,
    )
    counters = {"image": 0, "video": 0, "audio": 0}
    manifest = []
    for reference in normalized_refs:
        counters[reference.media_type] += 1
        manifest.append({
            "label": f"{_TAG_BY_MEDIA_TYPE[reference.media_type]}{counters[reference.media_type]}",
            "media_type": _MANIFEST_TYPE_BY_MEDIA_TYPE[reference.media_type],
            "role": reference.label or "辅助参考素材",
        })
    try:
        from pydantic_ai import Agent
        from novelvideo.config import get_newapi_text_pydantic_model

        task = (
            "根据下面 JSON 改写 MiniMax H3 多模态参考生视频提示词。\n"
            "硬性要求：只能使用 asset_manifest 中的引用编号；每个引用只承担指定角色；"
            "描述连续动作、稳定主体与连贯运镜；禁止幻灯片、硬切、定格和无关替换；"
            "输出中文最终提示词，不要解释。\n\n"
            + json.dumps({"asset_manifest": manifest, "creative_intent": creative_intent, "context": context or {}, "rule_based_draft": draft}, ensure_ascii=False)
        )
        agent = Agent(
            get_newapi_text_pydantic_model("MINIMAX_H3_PROMPT_COMPOSER_MODEL", "qwen-max"),
            output_type=_H3PromptComposerOutput,
            output_retries=1,
            name="MiniMax H3 Prompt Composer",
        )
        result = await agent.run(task)
        return str(result.output.prompt or "").strip() or draft
    except Exception:
        logger.warning("H3 prompt composer unavailable; using deterministic draft", exc_info=True)
        return draft
