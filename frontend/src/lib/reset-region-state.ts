// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { QueryClient } from "@tanstack/react-query";
import { useAspectRatioStore } from "@/stores/aspect-ratio-store";
import { useAuthStore } from "@/stores/auth-store";
import { useEpisodeWorkbenchStore } from "@/stores/episode-workbench-store";
import { useSaveStatusStore } from "@/stores/save-status-store";
import { useSeenPoolStore } from "@/stores/seen-pool-store";
import { useTaskCenterStore } from "@/task-center/store";
import { useRewardEventsStore } from "@/features/rewards/reward-events-store";

// UX chrome keys that must survive a region switch.
const PRESERVE_KEYS = new Set<string>([
  "supertale-app",
  "i18nextLng",
]);

// Prefix sweep is self-maintaining: any future region-scoped key matching
// these prefixes is covered without updating this list.
const SWEEP_PREFIXES = [
  "supertale-",
  "st.episode.",
  "st.beats.toggles",
  "st.beats.action-panel.sections",
];

export function resetRegionState(deps: { queryClient: QueryClient }): void {
  useAuthStore.getState().reset();
  useSaveStatusStore.getState().reset();
  useSeenPoolStore.getState().reset();
  useEpisodeWorkbenchStore.getState().reset();
  useTaskCenterStore.getState().reset();
  useAspectRatioStore.getState().reset();
  useRewardEventsStore.getState().reset();

  deps.queryClient.clear();

  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (PRESERVE_KEYS.has(key)) continue;
    if (SWEEP_PREFIXES.some((p) => key.startsWith(p))) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
