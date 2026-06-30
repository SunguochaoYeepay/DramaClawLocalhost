// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { Beat } from "@/types/episode";

export interface ScriptFeedback {
  type: "success" | "warning";
  key: string;
  values?: Record<string, string | number>;
}

export function getScriptReloadFeedback(beats: Beat[] | null | undefined): ScriptFeedback {
  return (beats?.length ?? 0) > 0
    ? { type: "success", key: "episode.script.scriptReloaded" }
    : { type: "warning", key: "episode.script.scriptReloadedEmpty" };
}

export function getScriptReviewFeedback(result: unknown): ScriptFeedback {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (record.review_passed === false) {
      const summary =
        typeof record.review_summary === "string" && record.review_summary.trim()
          ? record.review_summary.trim()
          : "存在未修复问题";
      return {
        type: "warning",
        key: "episode.script.scriptReviewFailed",
        values: { summary },
      };
    }
  }
  return { type: "success", key: "episode.script.scriptReviewPassed" };
}

export function mergeTaskLogs(
  existing: readonly string[],
  incoming: readonly string[] | null | undefined,
  limit = 200,
): string[] {
  if (!incoming?.length) return [...existing];
  const out = [...existing];
  for (const line of incoming) {
    if (!line || out[out.length - 1] === line || out.includes(line)) continue;
    out.push(line);
  }
  return out.slice(-limit);
}
