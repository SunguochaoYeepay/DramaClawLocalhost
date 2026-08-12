"""剧本生成与 Beat 编辑端点。

2.0 主线以 SQLite/Cognee 为唯一脚本状态源；不再读写 scripts/epXXX_script.json。
"""

import logging
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("novelvideo.api.scripts")

from novelvideo.api.auth import get_api_user
from novelvideo.api.deps import (
    make_cognee_store,
    make_cognee_store_for_context,
    make_sqlite_store_for_context,
    make_sqlite_store,
    resolve_project_scope,
)
from novelvideo.api.schemas import (
    BeatUpdate,
    BeatVideoPromptGenerateRequest,
    Seedance2PromptGenerateRequest,
    ScriptGenerateRequest,
    ScriptSaveRequest,
)
from novelvideo.models import sync_beat_asset_refs
from novelvideo.ports import get_task_backend, get_usage_meter
from novelvideo.task_identity import project_task_state_key

router = APIRouter()

SEEDANCE2_PROMPT_FEATURE_KEY = "seedance2_prompt"
MODEL_CALL_CREDIT_POLICY_FEATURE_INCLUDED = "feature_included"


class _H3PromptComposerOutput(BaseModel):
    prompt: str = Field(default="")


def _build_h3_reference_prompt_draft(
    beat: dict[str, Any],
    references: list[dict[str, str]],
    manual_prompt_reference: str = "",
) -> str:
    """Create a usable H3 prompt even when the optional AI rewrite is offline."""
    visual = str(beat.get("visual_description") or "").strip()
    scene = str(beat.get("scene_description") or "").strip()
    narration = str(beat.get("dialogue") or beat.get("narration_segment") or "").strip()
    parts = [
        "@图1作为主主体与起始构图，保持其人物身份、面部、服装和画面风格一致。",
    ]
    for index, reference in enumerate(references, 2):
        label = str(reference.get("label") or "辅助视觉元素").strip()
        parts.append(f"@图{index}作为{label}的参考，仅继承与该素材相关的外观、道具或风格，不替换@图1主体。")
    if visual:
        parts.append(f"画面动作与事件：{visual}。")
    if scene:
        parts.append(f"场景环境：{scene}。")
    if narration:
        parts.append(f"镜头内容围绕：{narration}。")
    parts.append("保持一个连续镜头和连贯的人物、镜头运动，不要幻灯片式切换、硬切或定格。")
    if manual_prompt_reference.strip():
        parts.append(f"用户要求：{manual_prompt_reference.strip()}")
    return "".join(parts)


async def _generate_h3_reference_video_prompt(
    *,
    beat: dict[str, Any],
    references: list[dict[str, str]],
    manual_prompt_reference: str = "",
) -> str:
    """Mirror Seedance's asset-aware composer with H3's @图N editor syntax."""
    draft = _build_h3_reference_prompt_draft(beat, references, manual_prompt_reference)
    manifest = [
        {"label": "@图1", "role": "首帧主体与起始构图"},
        *[
            {"label": f"@图{index}", "role": str(item.get("label") or "辅助参考")}
            for index, item in enumerate(references, 2)
        ],
    ]
    task = (
        "根据下面 JSON 改写 MiniMax H3 多图参考生视频提示词。\n"
        "硬性要求：只能使用 asset_manifest 中的 @图N 编号；@图1是主主体；"
        "每张辅助图只能承担指定角色；描述连续运动，禁止幻灯片、硬切、定格；"
        "输出中文最终提示词，不要解释。\n\n"
        + json.dumps(
            {
                "asset_manifest": manifest,
                "beat": {
                    "visual_description": beat.get("visual_description") or "",
                    "scene_description": beat.get("scene_description") or "",
                    "narration": beat.get("dialogue") or beat.get("narration_segment") or "",
                },
                "user_prompt_reference": manual_prompt_reference,
                "rule_based_draft": draft,
            },
            ensure_ascii=False,
        )
    )
    try:
        from pydantic_ai import Agent
        from novelvideo.config import get_newapi_text_pydantic_model

        agent = Agent(
            get_newapi_text_pydantic_model("MINIMAX_H3_PROMPT_COMPOSER_MODEL", "qwen-max"),
            output_type=_H3PromptComposerOutput,
            output_retries=1,
            name="MiniMax H3 Prompt Composer",
        )
        result = await agent.run(task)
        prompt = str(result.output.prompt or "").strip()
        return prompt or draft
    except Exception:
        logger.warning("H3 prompt composer unavailable; using asset-aware draft", exc_info=True)
        return draft


def _requester_user_id_for_billing(resolved: Any, user: dict) -> str:
    ctx = getattr(resolved, "ctx", None)
    return str(
        getattr(ctx, "requester_user_id", "")
        or user.get("id")
        or user.get("user_id")
        or user.get("username")
        or ""
    )


async def _audio_duration_seconds(output_dir: str | Path, episode: int, beat_num: int):
    from novelvideo.utils.media_io import get_audio_duration_async
    from novelvideo.utils.path_resolver import PathResolver

    audio_path = PathResolver(str(output_dir), episode).audio(beat_num)
    if not audio_path.exists():
        return None
    return await get_audio_duration_async(str(audio_path))


def _first_existing_path(*paths: Path) -> str:
    for path in paths:
        if path.exists():
            return str(path)
    return ""


async def _generate_single_beat_video_prompt(
    *,
    store: Any | None = None,
    output_dir: str | Path,
    project_name: str = "",
    episode: int,
    beat: dict[str, Any],
    all_beats: list[dict[str, Any]] | None = None,
    prev_beat: dict[str, Any] | None = None,
    next_beat: dict[str, Any] | None = None,
    language: str = "en",
) -> str:
    """为 1.x 首帧视频模式生成单 Beat SuperPower 运动提示词。"""
    from novelvideo.agents.global_video_optimizer import (
        _build_color_appearance_map,
        get_global_video_optimizer,
    )
    from novelvideo.utils.path_resolver import PathResolver

    beat_num = int(beat.get("beat_number") or 0)
    paths = PathResolver(str(output_dir), episode)
    sketch_image_path = _first_existing_path(paths.sketch(beat_num), paths.frame(beat_num))
    if not sketch_image_path:
        raise ValueError(f"Beat {beat_num} 缺少草图或首帧，请先生成草图或预览")

    beats = list(all_beats or [beat])
    characters = []
    if store is not None and hasattr(store, "get_all_characters"):
        characters = [
            c.model_dump() if hasattr(c, "model_dump") else dict(c)
            for c in (store.get_all_characters() or [])
        ]

    character_color_map = _build_color_appearance_map(
        beats,
        characters,
        str(output_dir),
        project_name,
        episode=episode,
        cognee_store=store,
    )
    result = await get_global_video_optimizer().optimize_single_beat(
        beat=beat,
        sketch_image_path=sketch_image_path,
        character_color_map=character_color_map,
        language=language,
        prev_beat=prev_beat,
        next_beat=next_beat,
        prev_prompt=None,
        total_beats=len(beats),
    )
    return str(result.get("prompt") or "").strip()


async def _generate_single_beat_keyframe_prompt(
    *,
    output_dir: str | Path,
    episode: int,
    beat: dict[str, Any],
    next_beat: dict[str, Any],
    language: str = "en",
) -> str:
    """为 1.x 首尾帧模式生成单 Beat 过渡提示词。"""
    from novelvideo.agents.keyframe_prompt_builder import get_keyframe_prompt_builder
    from novelvideo.models import format_beat_narration
    from novelvideo.utils.path_resolver import PathResolver

    beat_num = int(beat.get("beat_number") or 0)
    next_beat_num = int(next_beat.get("beat_number") or beat_num + 1)
    paths = PathResolver(str(output_dir), episode)
    first_frame_path = _first_existing_path(paths.frame(beat_num), paths.sketch(beat_num))
    last_frame_path = _first_existing_path(
        paths.frame(next_beat_num), paths.sketch(next_beat_num)
    )
    if not first_frame_path:
        raise ValueError(f"Beat {beat_num} 缺少首帧或草图，请先生成预览或草图")
    if not last_frame_path:
        raise ValueError(f"Beat {next_beat_num} 缺少首帧或草图，请先生成预览或草图")

    audio_type = str(beat.get("audio_type") or "narration")
    narration = str(beat.get("narration_segment") or "")
    next_narration = str(next_beat.get("narration_segment") or "")
    speaker = str(beat.get("speaker") or "")
    narration_text = format_beat_narration(audio_type, speaker, narration)

    return await get_keyframe_prompt_builder().build(
        first_frame_path=first_frame_path,
        last_frame_path=last_frame_path,
        narration=narration_text,
        next_narration=next_narration,
        language=language,
        visual_description=str(beat.get("visual_description") or ""),
        next_visual_description=str(next_beat.get("visual_description") or ""),
        audio_type=audio_type,
        dialogue_line=narration if audio_type == "dialogue" else "",
        allow_fallback=False,
    )


async def _resolve_beat_video_prompt_target(
    *,
    store: Any,
    episode_num: int,
    beat_num: int,
) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
    script_data = await store.get_script_as_dict(episode_num)
    if not script_data:
        raise LookupError("Script not found")

    beats = list(script_data.get("beats") or [])
    target = next((beat for beat in beats if int(beat.get("beat_number") or 0) == beat_num), None)
    if target is None:
        raise LookupError(f"Beat {beat_num} not found")

    video_mode = str(target.get("video_mode") or "first_frame")
    next_beat = next(
        (beat for beat in beats if int(beat.get("beat_number") or 0) == beat_num + 1),
        None,
    )
    field = "keyframe_prompt" if video_mode == "keyframe" else "video_prompt"
    if field == "keyframe_prompt" and next_beat is None:
        raise ValueError("这是最后一个 Beat，无法生成首尾帧过渡提示词")
    return target, next_beat, field


async def _generate_and_save_beat_video_prompt(
    *,
    store: Any,
    output_dir: str | Path,
    project_name: str = "",
    episode_num: int,
    beat_num: int,
    language: str,
) -> dict[str, Any]:
    script_data = await store.get_script_as_dict(episode_num)
    if not script_data:
        raise LookupError("Script not found")

    beats = list(script_data.get("beats") or [])
    target, next_beat, field = await _resolve_beat_video_prompt_target(
        store=store,
        episode_num=episode_num,
        beat_num=beat_num,
    )
    prev_beat = next(
        (beat for beat in beats if int(beat.get("beat_number") or 0) == beat_num - 1),
        None,
    )

    if field == "keyframe_prompt":
        prompt = await _generate_single_beat_keyframe_prompt(
            output_dir=output_dir,
            episode=episode_num,
            beat=target,
            next_beat=next_beat,
            language=language,
        )
    else:
        prompt = await _generate_single_beat_video_prompt(
            store=store,
            output_dir=output_dir,
            project_name=project_name,
            episode=episode_num,
            beat=target,
            all_beats=beats,
            prev_beat=prev_beat,
            next_beat=next_beat,
            language=language,
        )

    target[field] = prompt
    sync_beat_asset_refs(target)
    saved = await store.update_beat_asset(
        episode_number=episode_num,
        beat_number=beat_num,
        **{field: prompt},
    )
    if not saved:
        raise RuntimeError(f"Beat {beat_num} was not updated")

    return {
        "beat": target,
        "field": field,
        "prompt": prompt,
    }


@router.get("/projects/{project}/episodes/{episode_num}/script")
async def get_script(project: str, episode_num: int, user: dict = Depends(get_api_user)):
    """获取指定集数的剧本。"""
    resolved = await resolve_project_scope(project, user, required_role="viewer")

    try:
        store = (
            await make_sqlite_store_for_context(resolved.ctx)
            if resolved.ctx
            else await make_sqlite_store(resolved.username, resolved.project_name)
        )
        script_data = await store.get_script_as_dict(episode_num)
        if script_data:
            return {"ok": True, "data": script_data}
    except Exception as exc:
        logger.exception("从 store 读取剧本失败: episode=%s", episode_num)
        raise HTTPException(status_code=500, detail=f"Script store read failed: {exc}") from exc

    return {"ok": True, "data": None, "message": "Script not generated yet"}


@router.post("/projects/{project}/episodes/{episode_num}/script/generate")
async def generate_script(
    project: str,
    episode_num: int,
    body: ScriptGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    """生成指定集数的剧本。"""
    logger.info("[%s] EP%d generate_script", project, episode_num)
    resolved = await resolve_project_scope(project, user, required_role="editor")
    ctx = resolved.ctx
    username = resolved.username
    project_name = resolved.project_name
    output_dir = resolved.output_dir
    store = (
        await make_sqlite_store_for_context(ctx)
        if ctx
        else await make_sqlite_store(username, project_name)
    )
    episode = store.get_episode(episode_num)
    if not getattr(episode, "identity_ids", None):
        return {
            "ok": False,
            "code": "identity_plan_required",
            "error": f"第 {episode_num} 集尚未规划角色身份，请先规划身份",
        }

    config = {}

    # 启动前清理旧 sketch 展示文件，确保即使任务失败画廊也不展示旧草图
    from novelvideo.utils.path_resolver import PathResolver

    paths = PathResolver(output_dir, episode_num)
    paths.clean_sketches()

    if ctx is not None:
        queued = await get_task_backend().enqueue_project_task(
            ctx,
            task_type="script_writer",
            queue_kind="default",
            episode=episode_num,
            payload={"episode": episode_num, "config": config, "output_dir": output_dir},
        )
        return {
            "ok": True,
            "task_type": "script_writer",
            "task_id": queued.task_state.task_id,
            "task_key": project_task_state_key("script_writer", ctx.project_id, episode_num),
            "backend": queued.backend,
            "queue": queued.queue,
            "message": f"第 {episode_num} 集剧本生成任务已进入队列",
        }

    return {"ok": False, "error": "剧本生成需要 project context"}


@router.patch("/projects/{project}/episodes/{episode_num}/beats/{beat_num}")
async def update_beat(
    project: str,
    episode_num: int,
    beat_num: int,
    body: BeatUpdate,
    user: dict = Depends(get_api_user),
):
    """编辑指定 Beat。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    logger.info(
        "[%s] EP%d update_beat: beat=%d, fields=%s",
        project,
        episode_num,
        beat_num,
        list(body.model_dump(exclude_none=True).keys()),
    )
    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    script_data = await store.get_script_as_dict(episode_num)
    if not script_data:
        raise HTTPException(status_code=404, detail="Script not found")
    beats = list(script_data.get("beats") or [])
    target = next((beat for beat in beats if int(beat.get("beat_number") or 0) == beat_num), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"Beat {beat_num} not found")

    updates = body.model_dump(exclude_none=True)
    for key, value in updates.items():
        target[key] = value
    sync_beat_asset_refs(target)

    try:
        saved = await store.update_beat_asset(
            episode_number=episode_num,
            beat_number=beat_num,
            **{
                k: v
                for k, v in updates.items()
                if k
                in (
                    "narration_segment",
                    "visual_description",
                    "audio_type",
                    "speaker",
                    "detected_identities",
                    "detected_props",
                    "scene_ref",
                    "time_of_day",
                    "video_mode",
                    "video_prompt",
                    "keyframe_prompt",
                    "seedance2_config_json",
                )
            },
        )
        if not saved:
            raise RuntimeError(f"Beat {beat_num} was not updated")
    except Exception as exc:
        logger.exception(
            "Beat 保存失败: episode=%s beat=%s", episode_num, beat_num
        )
        raise HTTPException(status_code=500, detail=f"Beat store update failed: {exc}") from exc

    return {"ok": True, "data": target}


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/video-prompt/generate")
async def generate_beat_video_prompt(
    project: str,
    episode_num: int,
    beat_num: int,
    body: BeatVideoPromptGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    """AI 生成 1.x 单个 Beat 的视频提示词并保存。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    body = body or BeatVideoPromptGenerateRequest()

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )

    try:
        _, _, field = await _resolve_beat_video_prompt_target(
            store=store,
            episode_num=episode_num,
            beat_num=beat_num,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    # Unlike the legacy first-frame optimizer, H3 needs the ordered reference
    # manifest to write @图N semantics. Keep this request synchronous so the
    # rule-based fallback can still return a prompt when the LLM gateway is
    # temporarily unavailable.
    if body.h3_reference_images:
        script_data = await store.get_script_as_dict(episode_num)
        target = next(
            (
                beat
                for beat in list((script_data or {}).get("beats") or [])
                if int(beat.get("beat_number") or 0) == beat_num
            ),
            None,
        )
        if target is None:
            raise HTTPException(status_code=404, detail=f"Beat {beat_num} not found")
        prompt = await _generate_h3_reference_video_prompt(
            beat=target,
            references=body.h3_reference_images[:8],
            manual_prompt_reference=str(body.manual_prompt_reference or ""),
        )
        target["video_prompt"] = prompt
        sync_beat_asset_refs(target)
        saved = await store.update_beat_asset(
            episode_number=episode_num,
            beat_number=beat_num,
            video_prompt=prompt,
        )
        if not saved:
            raise RuntimeError(f"Beat {beat_num} was not updated")
        return {"ok": True, "data": {"beat": target, "field": "video_prompt", "prompt": prompt}}

    if resolved.ctx is not None:
        queued = await get_task_backend().enqueue_project_task(
            resolved.ctx,
            task_type="beat_video_prompt",
            queue_kind="default",
            episode=episode_num,
            beat_num=beat_num,
            payload={
                "episode": episode_num,
                "beat_num": beat_num,
                "field": field,
                "language": body.language,
                "output_dir": str(resolved.output_dir),
                "display_name": f"生成提示词 · EP{episode_num} / Beat {beat_num}",
            },
        )
        return {
            "ok": True,
            "task_type": "beat_video_prompt",
            "task_id": queued.task_state.task_id,
            "task_key": project_task_state_key(
                "beat_video_prompt",
                resolved.ctx.project_id,
                episode_num,
                beat_num=beat_num,
            ),
            "backend": queued.backend,
            "queue": queued.queue,
            "message": f"第 {episode_num} 集 Beat {beat_num} 提示词生成已入队",
        }

    try:
        data = await _generate_and_save_beat_video_prompt(
            store=store,
            output_dir=resolved.output_dir,
            project_name=resolved.project_name,
            episode_num=episode_num,
            beat_num=beat_num,
            language=body.language,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        logger.exception(
            "Beat 视频提示词生成失败: episode=%s beat=%s", episode_num, beat_num
        )
        raise HTTPException(status_code=500, detail=f"Beat video prompt generation failed: {exc}") from exc

    return {
        "ok": True,
        "data": data,
    }


@router.post("/projects/{project}/episodes/{episode_num}/beats/{beat_num}/seedance2-prompt/generate")
async def generate_seedance2_prompt(
    project: str,
    episode_num: int,
    beat_num: int,
    body: Seedance2PromptGenerateRequest | None = None,
    user: dict = Depends(get_api_user),
):
    """AI 生成单个 Beat 的 Seedance2 final_prompt 并保存回配置 JSON。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    project_dir = resolved.project_dir
    body = body or Seedance2PromptGenerateRequest()

    store = (
        await make_sqlite_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_sqlite_store(resolved.username, resolved.project_name)
    )
    script_data = await store.get_script_as_dict(episode_num)
    if not script_data:
        raise HTTPException(status_code=404, detail="Script not found")

    beats = list(script_data.get("beats") or [])
    target = next((beat for beat in beats if int(beat.get("beat_number") or 0) == beat_num), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"Beat {beat_num} not found")

    next_beat = next(
        (beat for beat in beats if int(beat.get("beat_number") or 0) == beat_num + 1),
        None,
    )

    from novelvideo.seedance2_i2v.models import parse_seedance2_config

    config = parse_seedance2_config(target.get("seedance2_config_json"))
    mode = getattr(config.mode, "value", str(config.mode))
    if mode == "first_last_frame" and next_beat is None:
        return {"ok": False, "error": "这是最后一个 Beat，无法使用首尾帧模式"}

    usage_meter = get_usage_meter()
    ctx = getattr(resolved, "ctx", None)
    project_id = str(getattr(ctx, "project_id", "") or "")
    reservation = await usage_meter.reserve_feature_start_credits(
        user_id=_requester_user_id_for_billing(resolved, user),
        feature_key=SEEDANCE2_PROMPT_FEATURE_KEY,
        project_id=project_id,
        resource_kind="script",
        task_type=SEEDANCE2_PROMPT_FEATURE_KEY,
        metadata={
            "source": "sync_api",
            "endpoint": "generate_seedance2_prompt",
            "episode": episode_num,
            "beat_num": beat_num,
            "mode": mode,
        },
        require_price_rule=True,
        require_positive_cost=True,
    )
    reservation_id = str(reservation.get("id") or "")
    billing_metadata: dict[str, Any] = {
        "model_call_credit_policy": MODEL_CALL_CREDIT_POLICY_FEATURE_INCLUDED,
        "feature_key": SEEDANCE2_PROMPT_FEATURE_KEY,
        "source": "sync_api",
    }
    if reservation_id:
        billing_metadata.update(
            {
                "feature_credit_reservation_id": reservation_id,
                "feature_credit_charge_id": reservation_id,
                "feature_credit_cost": str(reservation.get("cost") or 0),
            }
        )

    try:
        usage_meter.set_llm_usage_context(
            _requester_user_id_for_billing(resolved, user),
            project_id=project_id,
            resource_kind="script",
            billing_metadata=billing_metadata,
        )
        from novelvideo.seedance2_i2v.panel_service import generate_seedance2_prompt_for_panel

        saved_json = await generate_seedance2_prompt_for_panel(
            store=store,
            episode=episode_num,
            beat=target,
            project_dir=project_dir,
            next_beat=next_beat,
            manual_prompt_reference=body.manual_prompt_reference,
            prompt_guidance=body.prompt_guidance,
            prop_menu=list(script_data.get("prop_menu") or []),
        )
    except ValueError as exc:
        if reservation_id:
            await usage_meter.refund_feature_credit_reservation(
                reservation_id,
                metadata={
                    "source": "sync_api",
                    "endpoint": "generate_seedance2_prompt",
                    "episode": episode_num,
                    "beat_num": beat_num,
                    "error": str(exc),
                },
            )
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        if reservation_id:
            try:
                await usage_meter.refund_feature_credit_reservation(
                    reservation_id,
                    metadata={
                        "source": "sync_api",
                        "endpoint": "generate_seedance2_prompt",
                        "episode": episode_num,
                        "beat_num": beat_num,
                        "error": str(exc),
                    },
                )
            except Exception:
                logger.exception(
                    "Failed to refund Seedance2 prompt feature credit reservation"
                )
        raise
    finally:
        usage_meter.clear_llm_usage_context()

    try:
        target["seedance2_config_json"] = saved_json
        sync_beat_asset_refs(target)
        updated_config = parse_seedance2_config(saved_json)
        if reservation_id:
            await usage_meter.confirm_feature_credit_reservation(
                reservation_id,
                metadata={
                    "source": "sync_api",
                    "endpoint": "generate_seedance2_prompt",
                    "episode": episode_num,
                    "beat_num": beat_num,
                    "mode": mode,
                },
            )
    except Exception as exc:
        if reservation_id:
            try:
                await usage_meter.refund_feature_credit_reservation(
                    reservation_id,
                    metadata={
                        "source": "sync_api",
                        "endpoint": "generate_seedance2_prompt",
                        "episode": episode_num,
                        "beat_num": beat_num,
                        "error": str(exc),
                    },
                )
            except Exception:
                logger.exception(
                    "Failed to refund Seedance2 prompt feature credit reservation"
                )
        raise

    return {
        "ok": True,
        "data": {
            "beat": target,
            "seedance2_config_json": saved_json,
            "final_prompt": updated_config.final_prompt,
            "prompt_source": updated_config.prompt_source,
        },
    }


@router.put("/projects/{project}/episodes/{episode_num}/script")
async def save_script(
    project: str,
    episode_num: int,
    body: ScriptSaveRequest,
    user: dict = Depends(get_api_user),
):
    """保存（覆盖）指定集数的完整剧本。"""
    resolved = await resolve_project_scope(project, user, required_role="editor")
    logger.info("[%s] EP%d save_script: %d beats", project, episode_num, len(body.beats))

    store = (
        await make_cognee_store_for_context(resolved.ctx)
        if resolved.ctx
        else await make_cognee_store(resolved.username, resolved.project_name)
    )
    await store.load_graph_state()

    normalized_beats = []
    for beat in body.beats:
        beat_payload = dict(beat)
        sync_beat_asset_refs(beat_payload)
        normalized_beats.append(beat_payload)

    try:
        await store.persist_beats_from_script(episode_num, normalized_beats)
    except Exception as e:
        logger.exception("完整脚本保存后回写图谱失败: episode=%s", episode_num)
        raise HTTPException(
            status_code=500,
            detail=f"Script store sync failed: {e}",
        )

    return {
        "ok": True,
        "data": {
            "episode": episode_num,
            "beats_count": len(body.beats),
        },
    }
