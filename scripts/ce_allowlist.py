#!/usr/bin/env python3
"""CE 守栏统一白名单加载器（零依赖，stdlib tomllib）。

各 linter 从这里取「豁免清单」，不再各自硬编码 SKIP_PATHS / 行内标记，
使所有放行口子收口到 ce-allowlist.toml 一处、可集中审计。
import-lint / cp-port 刻意不消费本模块——它们零豁免。
"""
from __future__ import annotations

import sys
import tomllib
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = REPO_ROOT / "ce-allowlist.toml"


@lru_cache(maxsize=1)
def load() -> dict:
    if not MANIFEST.exists():
        raise SystemExit(f"缺少白名单清单：{MANIFEST}")
    return tomllib.loads(MANIFEST.read_text(encoding="utf-8"))


def inline_marker() -> str:
    """行内豁免标记（命中行含此注释即放行）。"""
    return load()["marker"]["inline"]


def known_guards() -> list[str]:
    return list(load().get("guards", {}).get("known", []))


def skip_entries() -> list[dict]:
    return list(load().get("skip", []))


def skip_paths(guard: str) -> set[str]:
    """指定 guard 适用的豁免路径集合。"""
    return {e["path"] for e in skip_entries() if guard in e.get("guards", [])}


def _self_check() -> int:
    """CI 自检：清单结构完整 + 无指向不存在文件的腐烂豁免。"""
    known = set(known_guards())
    if not known:
        print("✖ guards.known 为空", file=sys.stderr)
        return 1
    problems: list[str] = []
    for entry in skip_entries():
        if not ({"path", "guards", "reason"} <= entry.keys()):
            problems.append(f"缺字段: {entry}")
            continue
        if not str(entry["reason"]).strip():
            problems.append(f"缺 reason: {entry['path']}")
        if not set(entry["guards"]) <= known:
            problems.append(f"未知 guard: {entry['path']} -> {entry['guards']}")
        if not (REPO_ROOT / entry["path"]).is_file():
            problems.append(f"腐烂豁免（文件不存在）: {entry['path']}")
    if problems:
        print("✖ ce-allowlist.toml 校验失败：", file=sys.stderr)
        for item in problems:
            print(f"  {item}", file=sys.stderr)
        return 1
    print(f"✓ ce-allowlist.toml：{len(skip_entries())} 条豁免均合规，标记={inline_marker()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_self_check())
