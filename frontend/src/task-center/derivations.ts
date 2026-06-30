// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { TaskState } from "./types";
import { stageForTaskType } from "@/lib/episode-stage-registry";

export const isTerminal = (t: TaskState): boolean =>
  t.status === "completed" || t.status === "failed" || t.status === "cancelled";

export const isActive = (t: TaskState): boolean =>
  t.status === "submitting" ||
  t.status === "queued" ||
  t.status === "pending" ||
  t.status === "starting" ||
  t.status === "running";

export const ageMs = (t: TaskState, now: number = Date.now()): number =>
  now - Date.parse(t.updated_at);

type TFn = (key: string, options?: Record<string, unknown>) => string;

function isInternalRunScope(scope: string | null | undefined): boolean {
  return /^scene_run_[a-z0-9]+$/i.test(scope ?? "") || /^prop_run_[a-z0-9]+$/i.test(scope ?? "");
}

export const displayLabel = (t: TaskState, tFn: TFn): string => {
  if (t.display_name) return t.display_name;

  const parts = [t.task_type_label || tFn(`tasks.types.${t.task_type}`)];
  if (t.episode > 0) parts.push(`ep${t.episode}`);
  if (t.beat_num != null) parts.push(`beat ${t.beat_num}`);
  if (t.scope && !isInternalRunScope(t.scope)) parts.push(t.scope);
  return parts.join(" · ");
};

export interface OriginDeepLink {
  to: string;
  params: Record<string, string>;
}

export const originDeepLink = (t: TaskState): OriginDeepLink | null => {
  const stage = stageForTaskType(t.task_type);
  if (!stage) return null;
  // stage.routeSegment already starts with "/" (e.g., "/sketches")
  return {
    to: `/projects/$project/episodes/$episode${stage.routeSegment}`,
    params: { project: t.project_id ?? t.project, episode: String(t.episode) },
  };
};
