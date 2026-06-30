"""Claymore 上下文工程模块。

提供风格提取等辅助功能。
"""

from novelvideo.claymore.style_extractor import (
    NovelStyle,
    extract_style_from_novel,
    format_style_as_markdown,
    format_style_for_prompt,
)

__all__ = [
    "NovelStyle",
    "extract_style_from_novel",
    "format_style_as_markdown",
    "format_style_for_prompt",
]
