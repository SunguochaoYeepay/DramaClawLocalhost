"""LLM 风格提取器。

从小说原文提取叙事风格，用于指导后续脚本生成。
替代旧的从脚本提取风格的方法。
"""

import json
from typing import Optional

from pydantic import BaseModel, Field
from rich.console import Console

console = Console()


class NovelStyle(BaseModel):
    """小说风格特征（LLM 提取）。"""

    # 叙事风格
    narrative_person: str = Field(
        default="第三人称",
        description="叙事人称：第一人称/第三人称/全知视角",
    )
    tone: str = Field(
        default="沉稳",
        description="语调：幽默/严肃/讽刺/抒情/悬疑等",
    )
    sentence_rhythm: str = Field(
        default="混合",
        description="句式节奏：短句为主/长句为主/混合",
    )
    vocabulary_level: str = Field(
        default="文学化",
        description="词汇风格：口语化/文学化/古典/现代",
    )
    emotional_intensity: str = Field(
        default="中等",
        description="情感强度：克制/中等/强烈",
    )

    # 代表性句子
    example_sentences: list[str] = Field(
        default_factory=list,
        description="3-5个代表原著风格的句子",
    )

    # 禁止词汇（从原著风格推断）
    forbidden_words: list[str] = Field(
        default_factory=lambda: ["嘿", "哇", "天呐", "哇塞"],
        description="不符合原著风格的词汇",
    )

    # 视觉风格提示
    visual_style: str = Field(
        default="写实风格",
        description="画面风格：写实/动漫/水墨/油画等",
    )
    color_tone: str = Field(
        default="暖色调",
        description="色调偏好：暖色调/冷色调/中性",
    )
    era_setting: str = Field(
        default="",
        description="时代背景：古代/现代/未来/架空等",
    )


STYLE_EXTRACTION_PROMPT = """你是一位专业的文学分析师。请仔细阅读以下小说片段，分析其叙事风格特征。

## 小说片段

{novel_excerpt}

## 分析要求

请从以下维度分析小说的叙事风格：

1. **叙事人称**：第一人称（"我"视角）/ 第三人称（限制视角）/ 全知视角
2. **语调**：幽默、严肃、讽刺、抒情、悬疑、冷峻等
3. **句式节奏**：短句为主（节奏快）/ 长句为主（细腻描写）/ 混合
4. **词汇风格**：口语化、文学化、古典、现代
5. **情感强度**：克制（含蓄）/ 中等 / 强烈（直接表达）
6. **代表性句子**：选出 3-5 个最能体现原著风格的句子
7. **视觉风格**：推断适合这部小说的画面风格
8. **时代背景**：古代/现代/未来/架空

## 输出格式

请以 JSON 格式输出，包含以下字段：
```json
{{
    "narrative_person": "第三人称",
    "tone": "讽刺幽默",
    "sentence_rhythm": "混合",
    "vocabulary_level": "古典",
    "emotional_intensity": "克制",
    "example_sentences": [
        "示例句子1",
        "示例句子2",
        "示例句子3"
    ],
    "forbidden_words": ["不符合风格的词1", "不符合风格的词2"],
    "visual_style": "写实古装剧风格",
    "color_tone": "暖色调",
    "era_setting": "清代"
}}
```

只输出 JSON，不要其他内容。
"""


async def extract_style_from_novel(
    content: str,
    max_chars: int = 30000,
) -> NovelStyle:
    """用 LLM 从小说原文提取风格。

    Args:
        content: 小说内容
        max_chars: 用于分析的最大字符数

    Returns:
        提取的风格特征
    """
    # 截取内容（取开头和中间部分，更能代表整体风格）
    excerpt = _get_representative_excerpt(content, max_chars)

    prompt = STYLE_EXTRACTION_PROMPT.format(novel_excerpt=excerpt)

    try:
        from pydantic_ai import Agent
        from novelvideo.config import get_pydantic_model

        agent = Agent(
            get_pydantic_model(),
            name="StyleExtractor",
        )

        result = await agent.run(prompt)
        response_text = str(result.output)

        # 解析 JSON
        style = _parse_style_response(response_text)
        console.print(f"[green]风格提取完成: {style.tone} / {style.narrative_person}[/green]")
        return style

    except Exception as e:
        console.print(f"[yellow]风格提取失败: {e}，使用默认风格[/yellow]")
        return NovelStyle()


def _get_representative_excerpt(content: str, max_chars: int) -> str:
    """获取代表性片段（开头 + 中间）。"""
    if len(content) <= max_chars:
        return content

    # 取开头 60% + 中间 40%
    head_size = int(max_chars * 0.6)
    mid_size = max_chars - head_size

    head = content[:head_size]

    # 中间部分从 40% 位置开始
    mid_start = int(len(content) * 0.4)
    mid = content[mid_start : mid_start + mid_size]

    return f"{head}\n\n[...中间省略...]\n\n{mid}"


def _parse_style_response(response: str) -> NovelStyle:
    """解析 LLM 响应为 NovelStyle。"""
    # 清理响应文本
    text = response.strip()

    # 提取 JSON 部分
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        text = text[start:end].strip()
    elif "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        text = text[start:end].strip()

    try:
        data = json.loads(text)
        return NovelStyle(**data)
    except json.JSONDecodeError:
        # 尝试修复常见问题
        text = text.replace("'", '"')
        try:
            data = json.loads(text)
            return NovelStyle(**data)
        except json.JSONDecodeError:
            console.print(f"[yellow]JSON 解析失败，使用默认风格[/yellow]")
            return NovelStyle()


def format_style_for_prompt(style: NovelStyle) -> str:
    """将风格格式化为 Prompt 注入内容。"""
    examples = "\n".join(f"  - 「{s}」" for s in style.example_sentences[:3])
    forbidden = "、".join(style.forbidden_words)

    return f"""## 原著风格指南（必须遵守）

### 叙事风格
- **人称**: {style.narrative_person}
- **语调**: {style.tone}
- **句式**: {style.sentence_rhythm}
- **词汇**: {style.vocabulary_level}
- **情感**: {style.emotional_intensity}

### 代表性句子（模仿这种风格）
{examples}

### 禁止词汇（不符合原著风格）
{forbidden}

### 视觉风格
- **画面**: {style.visual_style}
- **色调**: {style.color_tone}
- **时代**: {style.era_setting}

请严格遵守以上风格规范，保持与原著一致的叙事风格。
"""


def format_style_as_markdown(style: NovelStyle) -> str:
    """将风格格式化为 Markdown 文件内容。"""
    from datetime import datetime

    examples = "\n".join(f"- 「{s}」" for s in style.example_sentences)
    forbidden = "、".join(style.forbidden_words)

    return f"""# Project Style Guide

## 生成时间
{datetime.now().isoformat()}

## 提取来源
从小说原文提取（LLM 分析）

## 叙事风格
- **人称**: {style.narrative_person}
- **语调**: {style.tone}
- **句式节奏**: {style.sentence_rhythm}
- **词汇风格**: {style.vocabulary_level}
- **情感强度**: {style.emotional_intensity}

## 代表性句子
{examples}

## 禁止词汇
{forbidden}

## 视觉风格
- **画面风格**: {style.visual_style}
- **色调偏好**: {style.color_tone}
- **时代背景**: {style.era_setting}

## 一致性检查点
1. 叙事人称保持一致
2. 语调风格保持一致
3. 避免使用禁止词汇
4. 模仿代表性句子的风格

## 更新历史
- [{datetime.now().strftime('%Y-%m-%d')}] 从小说原文提取
"""
