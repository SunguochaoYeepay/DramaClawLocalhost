// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useCallback, useEffect, useState } from "react";

import {
  fetchNodeGenerationHistory,
  type FreezoneGenerationHistoryRecord,
} from "@/api/ops";
import { readUrl } from "@/lib/url-params";

export interface UseCanvasGenerationHistoryResult {
  records: FreezoneGenerationHistoryRecord[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/** Fan-out concurrency cap for the per-node aggregation. */
const FANOUT_CONCURRENCY = 6;

/**
 * Aggregate per-node generation history client-side: one request per node id
 * (capped concurrency), merges, dedupes by record id, sorts newest-first.
 */
async function aggregatePerNode(
  project: string,
  canvasId: string,
  nodeIds: string[],
): Promise<FreezoneGenerationHistoryRecord[]> {
  const out: FreezoneGenerationHistoryRecord[] = [];
  for (let i = 0; i < nodeIds.length; i += FANOUT_CONCURRENCY) {
    const slice = nodeIds.slice(i, i + FANOUT_CONCURRENCY);
    const batches = await Promise.all(
      slice.map((nodeId) =>
        fetchNodeGenerationHistory(project, canvasId, nodeId).catch(() => []),
      ),
    );
    for (const batch of batches) out.push(...batch);
  }
  const seen = new Set<string>();
  return out
    .filter((record) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
    );
}

/**
 * Read the whole canvas's generation history for the history-assets modal by
 * fanning out the per-node generation-history endpoint over `nodeIds` and
 * merging. History lives outside the canvas JSON, so this is a plain on-demand
 * fetch gated by `enabled` (the modal only mounts when opened).
 */
export function useCanvasGenerationHistory(
  nodeIds: string[],
  options?: { enabled?: boolean },
): UseCanvasGenerationHistoryResult {
  const enabled = options?.enabled ?? true;
  const [records, setRecords] = useState<FreezoneGenerationHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Snapshot the ids as a stable string so the callback identity only changes
  // when the actual id set changes (not on every nodes-array reference churn).
  const nodeIdsKey = nodeIds.join(",");

  const refresh = useCallback(async () => {
    const project = readUrl().project;
    if (!project) return;
    const canvasId = readUrl().canvas ?? "default";
    setIsLoading(true);
    try {
      const ids = nodeIdsKey ? nodeIdsKey.split(",") : [];
      const recs = await aggregatePerNode(project, canvasId, ids);
      setRecords(recs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [nodeIdsKey]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return { records, isLoading, error, refresh };
}
