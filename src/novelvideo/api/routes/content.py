"""原文、改写稿与解说 adapter 端点。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from novelvideo.api.auth import get_api_user, require_project_scope
from novelvideo.api.deps import get_sqlite_store
from novelvideo.api.schemas import ContentUpdateRequest, RewriteGenerateRequest
from novelvideo.sqlite_store import SQLiteStore

logger = logging.getLogger("novelvideo.api.content")

router = APIRouter()


@router.get("/projects/{project}/episodes/{episode_num}/raw-content")
async def get_raw_content(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """读取指定集的原文。"""
    content = await store.load_episode_content(episode_num) or ""
    return {"ok": True, "data": {"episode": episode_num, "content": content}}


@router.put("/projects/{project}/episodes/{episode_num}/raw-content")
async def put_raw_content(
    project: str,
    episode_num: int,
    body: ContentUpdateRequest,
    user: dict = Depends(require_project_scope("projects:write")),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """保存指定集的原文。"""
    logger.info("[%s] EP%d put_raw_content: %d chars", project, episode_num, len(body.content))
    await store.save_episode_content(episode_num, body.content)
    return {"ok": True, "data": {"episode": episode_num, "length": len(body.content)}}


@router.get("/projects/{project}/episodes/{episode_num}/adapted-content")
async def get_adapted_content(
    project: str,
    episode_num: int,
    user: dict = Depends(get_api_user),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """读取指定集的改写稿。未保存时返回空串。"""
    content = await store.load_adapted_content(episode_num)
    return {"ok": True, "data": {"episode": episode_num, "content": content}}


@router.put("/projects/{project}/episodes/{episode_num}/adapted-content")
async def put_adapted_content(
    project: str,
    episode_num: int,
    body: ContentUpdateRequest,
    user: dict = Depends(require_project_scope("projects:write")),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """保存指定集的改写稿。集不存在时返回 400。"""
    logger.info(
        "[%s] EP%d put_adapted_content: %d chars",
        project,
        episode_num,
        len(body.content),
    )
    try:
        await store.save_adapted_content(episode_num, body.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "data": {"episode": episode_num, "length": len(body.content)}}


@router.delete("/projects/{project}/episodes/{episode_num}/adapted-content")
async def delete_adapted_content(
    project: str,
    episode_num: int,
    user: dict = Depends(require_project_scope("projects:write")),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """清空指定集的改写稿，回退到原文。"""
    logger.info("[%s] EP%d delete_adapted_content", project, episode_num)
    try:
        await store.save_adapted_content(episode_num, "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "data": {"episode": episode_num}}


@router.post("/projects/{project}/episodes/{episode_num}/rewrite/generate")
async def generate_rewrite(
    project: str,
    episode_num: int,
    body: RewriteGenerateRequest,
    user: dict = Depends(require_project_scope("projects:write")),
    store: SQLiteStore = Depends(get_sqlite_store),
):
    """同步执行“原文 → 逐行解说工作稿”，并保存到 adapted_content。

    这里故意不搬旧任务实现；2.0 后续可以把这个 adapter 包进
    新任务系统，但 adapter 与存储契约先稳定下来。
    """
    raw_content = (await store.load_episode_content(episode_num) or "").strip()
    if not raw_content:
        return {
            "ok": False,
            "error": f"第 {episode_num} 集尚未有原文，请先填写 raw-content",
        }

    await store.load_graph_state()
    episode = store.get_episode(episode_num)
    episode_title = getattr(episode, "title", "") if episode else ""
    narrator_main_name = _resolve_narrator_main_name(store)

    from novelvideo.agents.content_rewriter import rewrite_episode_content

    rewritten = await rewrite_episode_content(
        raw_content,
        episode_title=episode_title,
        protagonist_name=narrator_main_name,
        target_beats=body.target_beats,
        beat_chars_range=(body.beat_chars_min, body.beat_chars_max),
        narration_style=body.narration_style or "first_person",
    )
    normalized = rewritten.strip()
    if normalized == raw_content:
        normalized = ""
    try:
        await store.save_adapted_content(episode_num, normalized)
        await store.update_episode(episode_num, beat_source_text=normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    lines = [line for line in normalized.splitlines() if line.strip()]
    return {
        "ok": True,
        "data": {
            "episode": episode_num,
            "line_count": len(lines),
            "adapted_content": normalized,
            "used_fallback": not bool(normalized),
        },
    }


def _resolve_narrator_main_name(store: SQLiteStore) -> str:
    """从 store 里找 is_main=True 的解说主角名；没有返回空串。"""
    for character in store.get_all_characters():
        if getattr(character, "is_main", False):
            return character.name or ""
    return ""
