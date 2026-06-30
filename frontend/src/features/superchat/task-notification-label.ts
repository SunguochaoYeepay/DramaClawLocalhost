// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { displayLabel } from "@/task-center/derivations";
import type { TaskState } from "@/task-center/types";

type TFn = (key: string, options?: Record<string, unknown>) => string;

function stringRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sceneKindLabel(kind: string): string {
  if (kind === "master") return "主场景参考图";
  if (kind === "spatial_layout") return "空间布局参考图";
  if (kind === "reverse_master") return "反推场景参考图";
  return "场景参考图";
}

function parseTaskScope(scope: string | null | undefined): string[] {
  return String(scope ?? "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function beatRangeLabel(beats: number[]): string {
  if (beats.length === 0) return "";
  const sorted = [...new Set(beats)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (const beat of sorted.slice(1)) {
    if (beat === previous + 1) {
      previous = beat;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = beat;
    previous = beat;
  }

  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return `Beat ${ranges.join(", ")}`;
}

export function buildChatTaskLabel(task: Pick<
  TaskState,
  "task_type" | "result" | "display_name" | "task_type_label" | "episode" | "beat_num" | "scope"
>, t: TFn): string {
  const result = stringRecord(task.result);
  const scopeParts = parseTaskScope(task.scope);

  if (task.task_type === "sketch_generation") {
    const gridIndex = Number(result.grid_index);
    const totalGrids = Number(result.total_grids);
    const hasGridNumber =
      Number.isInteger(gridIndex)
      && gridIndex >= 0
      && Number.isInteger(totalGrids)
      && totalGrids > 0;
    const prefix = task.episode > 0 ? `第 ${task.episode} 集` : "";
    const gridLabel = hasGridNumber ? `草图网格 ${gridIndex + 1}/${totalGrids}` : "草图";
    const beatLabel = beatRangeLabel(numberArray(result.beat_numbers));
    const label = `${prefix}${gridLabel}`;
    return beatLabel ? `${label}（${beatLabel}）` : label;
  }

  if (task.task_type === "scene_reference_asset") {
    const sceneName = stringValue(result.scene_name) || scopeParts[1] || "";
    const kind = stringValue(result.kind) || scopeParts[2] || "";
    const kindLabel = sceneKindLabel(kind);
    return sceneName ? `${sceneName}${kindLabel}` : kindLabel;
  }

  if (task.task_type === "character_portrait") {
    const characterName = stringValue(result.character_name) || scopeParts[1] || "";
    const mode = stringValue(result.mode);
    const identityName = stringValue(result.identity_name) || scopeParts[3] || "";
    if (mode === "identity_portrait" || task.scope?.includes(":identity_portrait:")) {
      return characterName && identityName
        ? `${characterName}「${identityName}」身份肖像`
        : `${characterName || identityName || "角色"}身份肖像`;
    }
    return characterName ? `${characterName}肖像` : "角色肖像";
  }

  if (task.task_type === "identity_image") {
    const characterName = stringValue(result.character_name) || scopeParts[1] || "";
    const identityName = stringValue(result.identity_name) || scopeParts[3] || "";
    if (characterName && identityName) return `${characterName}「${identityName}」身份图`;
    return `${characterName || identityName || "角色"}身份图`;
  }

  if (task.beat_num != null && task.episode > 0) {
    return `${displayLabel(task as TaskState, t)}（第 ${task.episode} 集 Beat ${task.beat_num}）`;
  }

  if (task.episode > 0) {
    return `${displayLabel(task as TaskState, t)}（第 ${task.episode} 集）`;
  }

  return displayLabel(task as TaskState, t);
}
