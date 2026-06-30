// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { PushResult, PushTarget } from "@/api/push";
import {
  isDirectorWorldSourceSlotTarget,
  nodeDataAfterDirectorWorldSourceSlotCommit,
} from "./sceneDirectorWorldCommit";

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function sourceFilename(result: Pick<PushResult, "target_path" | "target_url">): string {
  const raw = stringValue(result.target_path) || stringValue(result.target_url);
  const clean = raw.split("#", 1)[0]?.split("?", 1)[0] ?? raw;
  return clean.split("/").filter(Boolean).pop() || raw;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function projectIdFromNodeData(
  nodeData: Record<string, unknown>,
  projectId?: string,
): string {
  const explicit = stringValue(projectId);
  if (explicit) return explicit;
  const contexts = Array.isArray(nodeData.mainline_context)
    ? nodeData.mainline_context
    : [];
  for (const context of contexts) {
    const record = recordValue(context);
    const value = stringValue(record?.projectId);
    if (value) return value;
  }
  const source = recordValue(nodeData.__freezone_source);
  const meta = recordValue(source?.meta);
  return (
    stringValue(source?.projectId) ||
    stringValue(meta?.projectId) ||
    stringValue(meta?.project_id)
  );
}

function mediaPatchForTarget(
  target: PushTarget,
  targetUrl: string,
): Record<string, unknown> {
  if (target.kind === "video") {
    return { videoUrl: targetUrl, previewImageUrl: targetUrl };
  }
  if (target.kind === "beat_audio") {
    return { audioUrl: targetUrl, url: targetUrl };
  }
  if (
    target.kind === "scene_3gs_master_ply" ||
    target.kind === "scene_3gs_reverse_ply" ||
    target.kind === "scene_3gs_pano_ply" ||
    target.kind === "scene_3gs_custom_scene"
  ) {
    return { fileUrl: targetUrl, modelUrl: targetUrl, plyUrl: targetUrl, url: targetUrl };
  }
  if (target.kind === "scene_director_pano_360") {
    return { imageUrl: targetUrl, previewImageUrl: targetUrl, panoUrl: targetUrl, url: targetUrl };
  }
  return { imageUrl: targetUrl, previewImageUrl: targetUrl };
}

function targetScopeMeta(target: PushTarget): Record<string, unknown> {
  if (
    target.kind === "frame" ||
    target.kind === "sketch" ||
    target.kind === "director_render" ||
    target.kind === "selected_background" ||
    target.kind === "video" ||
    target.kind === "beat_audio"
  ) {
    return { episode: target.episode, beat: target.beat };
  }
  if (
    target.kind === "identity" ||
    target.kind === "identity_costume" ||
    target.kind === "identity_portrait"
  ) {
    return { character: target.character, identity_id: target.identity_id };
  }
  if (target.kind === "portrait") {
    return { character: target.character };
  }
  if (
    target.kind === "scene_master" ||
    target.kind === "scene_reverse_master" ||
    target.kind === "scene_spatial_layout" ||
    target.kind === "scene_director_pano_360" ||
    target.kind === "scene_3gs_master_ply" ||
    target.kind === "scene_3gs_reverse_ply" ||
    target.kind === "scene_3gs_pano_ply" ||
    target.kind === "scene_3gs_custom_scene"
  ) {
    return { scene_id: target.scene_id, scene: target.scene_id };
  }
  if (target.kind === "prop_ref") {
    return { prop_id: target.prop_id, prop: target.prop_id };
  }
  return {};
}

function targetLabel(target: PushTarget): string {
  if (target.kind === "frame") return `EP${target.episode} / Beat ${target.beat} / 分镜`;
  if (target.kind === "sketch") return `EP${target.episode} / Beat ${target.beat} / 草图`;
  if (target.kind === "director_render") return `EP${target.episode} / Beat ${target.beat} / 导演合成图`;
  if (target.kind === "selected_background") return `EP${target.episode} / Beat ${target.beat} / 当前背景`;
  if (target.kind === "video") return `EP${target.episode} / Beat ${target.beat} / 视频`;
  if (target.kind === "beat_audio") return `EP${target.episode} / Beat ${target.beat} / 音频`;
  if (target.kind === "identity") return `${target.character} / ${target.identity_id} / 身份`;
  if (target.kind === "identity_costume") return `${target.character} / ${target.identity_id} / 服装`;
  if (target.kind === "identity_portrait") return `${target.character} / ${target.identity_id} / 身份头像`;
  if (target.kind === "portrait") return `${target.character} / 角色头像`;
  if (target.kind === "scene_master") return `${target.scene_id} / 正面图`;
  if (target.kind === "scene_reverse_master") return `${target.scene_id} / 背面图`;
  if (target.kind === "scene_spatial_layout") return `${target.scene_id} / 空间布局图`;
  if (target.kind === "scene_director_pano_360") return `${target.scene_id} / 360图`;
  if (target.kind === "scene_3gs_master_ply") return `${target.scene_id} / 正面世界`;
  if (target.kind === "scene_3gs_reverse_ply") return `${target.scene_id} / 背面世界`;
  if (target.kind === "scene_3gs_pano_ply") return `${target.scene_id} / 360世界`;
  if (target.kind === "scene_3gs_custom_scene") return `${target.scene_id} / 自定义世界`;
  if (target.kind === "prop_ref") return `${target.prop_id} / 道具`;
  return target.kind;
}

function contextForTarget(
  target: PushTarget,
  projectId: string,
  targetUrl: string,
  label: string,
): Record<string, unknown> | null {
  if (!projectId) return null;
  if (
    target.kind === "frame" ||
    target.kind === "sketch" ||
    target.kind === "video" ||
    target.kind === "selected_background"
  ) {
    return {
      kind: target.kind,
      projectId,
      episode: target.episode,
      beat: target.beat,
      role: target.kind,
      label,
      sourceUrl: targetUrl,
    };
  }
  if (target.kind === "director_render") {
    return {
      kind: "director_combined",
      projectId,
      episode: target.episode,
      beat: target.beat,
      role: target.kind,
      label,
      sourceUrl: targetUrl,
    };
  }
  if (target.kind === "beat_audio") {
    return {
      kind: "audio",
      projectId,
      episode: target.episode,
      beat: target.beat,
      audioRole: "beat_audio",
      role: target.kind,
      label,
      sourceUrl: targetUrl,
    };
  }
  if (
    target.kind === "identity" ||
    target.kind === "identity_costume" ||
    target.kind === "identity_portrait"
  ) {
    return {
      kind: "identity",
      projectId,
      character: target.character,
      identityId: target.identity_id,
      role: target.kind,
      label,
      sourceUrl: targetUrl,
    };
  }
  if (target.kind === "portrait") {
    return {
      kind: "identity",
      projectId,
      character: target.character,
      role: target.kind,
      label,
      sourceUrl: targetUrl,
    };
  }
  if (
    target.kind === "scene_master" ||
    target.kind === "scene_reverse_master" ||
    target.kind === "scene_spatial_layout" ||
    target.kind === "scene_director_pano_360" ||
    target.kind === "scene_3gs_master_ply" ||
    target.kind === "scene_3gs_reverse_ply" ||
    target.kind === "scene_3gs_pano_ply" ||
    target.kind === "scene_3gs_custom_scene"
  ) {
    return {
      kind: "scene",
      projectId,
      sceneId: target.scene_id,
      role: target.kind,
      label,
      sourceUrl: targetUrl,
    };
  }
  if (target.kind === "prop_ref") {
    return {
      kind: "prop",
      projectId,
      propId: target.prop_id,
      role: target.kind,
      label,
      sourceUrl: targetUrl,
    };
  }
  return null;
}

export function nodeDataAfterCommittedSlot(
  nodeData: Record<string, unknown>,
  target: PushTarget,
  result: Pick<PushResult, "target_path" | "target_url">,
  projectId?: string,
): Record<string, unknown> | null {
  if (target.kind === "scene_director_world") return null;
  if (isDirectorWorldSourceSlotTarget(target)) {
    return nodeDataAfterDirectorWorldSourceSlotCommit(nodeData, target, result, projectId);
  }
  const targetUrl = stringValue(result.target_url);
  if (!targetUrl) return null;
  const label = targetLabel(target);
  const isCandidate = nodeData.user_spawned === true;
  const effectiveProjectId = projectIdFromNodeData(nodeData, projectId);
  const context = contextForTarget(target, effectiveProjectId, targetUrl, label);
  const previousSource = recordValue(nodeData.__freezone_source);
  const previousMeta = recordValue(previousSource?.meta);
  const nextMeta = {
    ...previousMeta,
    ...targetScopeMeta(target),
  };

  return {
    ...nodeData,
    ...mediaPatchForTarget(target, targetUrl),
    displayName: isCandidate ? `已提交 · ${label}` : label,
    sourceFileName: sourceFilename(result),
    slot_target: target,
    committed_slot_url: targetUrl,
    committed_target_label: label,
    ...(isCandidate
      ? {
          mainline_context: undefined,
          __freezone_source: previousSource ?? nodeData.__freezone_source,
        }
      : {
          __freezone_source: {
            ...previousSource,
            kind: target.kind,
            role: target.kind,
            label,
            meta: nextMeta,
            url: targetUrl,
            slot_target: target,
            pushable: true,
          },
          ...(context ? { mainline_context: [context] } : {}),
        }),
  };
}
