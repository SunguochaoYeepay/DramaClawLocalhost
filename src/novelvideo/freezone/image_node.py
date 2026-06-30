"""Freezone 图片节点辅助逻辑。"""

from __future__ import annotations

from pathlib import Path

from pydantic_ai import Agent, BinaryContent

from novelvideo.config import get_pydantic_model

_reverse_prompt_agent: Agent | None = None


def build_image_reverse_prompt_task() -> str:
    return "\n".join(
        [
            "你是一个图片节点提示词反推助手。",
            "我会给你一张图片，请根据图片内容反推出一段直接可用于文生图或图生图的中文提示词。",
            "要求：",
            "- 只输出最终提示词，不要解释，不要 markdown，不要引号。",
            "- 提示词应包含：主体、场景、构图/景别、光线、色调、材质/细节、氛围、风格。",
            "- 用创作者写提示词的自然表达，不要写成分析报告。",
            "- 不要编造图片里没有的关键主体或剧情动作。",
            "- 保持精炼但信息密度高，适合直接粘贴给图片模型。",
        ]
    )


def get_freezone_image_reverse_prompt_agent() -> Agent:
    global _reverse_prompt_agent
    if _reverse_prompt_agent is None:
        _reverse_prompt_agent = Agent(
            get_pydantic_model(),
            system_prompt=(
                "你是一个图片节点提示词反推助手。"
                "你会根据输入图片内容，输出一段可直接用于文生图或图生图的中文提示词。"
            ),
            output_type=str,
            name="Freezone Reverse Prompt",
        )
    return _reverse_prompt_agent


async def reverse_prompt_from_image(
    *,
    image_path: Path,
) -> str:
    prompt = build_image_reverse_prompt_task()
    image_bytes = image_path.read_bytes()
    mime_type = "image/png"
    suffix = image_path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        mime_type = "image/jpeg"
    elif suffix == ".webp":
        mime_type = "image/webp"

    response = await get_freezone_image_reverse_prompt_agent().run(
        [prompt, BinaryContent(data=image_bytes, media_type=mime_type)]
    )
    prompt_text = (response.output or "").strip()
    if prompt_text.startswith("```"):
        prompt_text = "\n".join(
            line for line in prompt_text.splitlines() if not line.strip().startswith("```")
        ).strip()
    if not prompt_text:
        raise RuntimeError("reverse prompt model returned empty prompt")
    return prompt_text
