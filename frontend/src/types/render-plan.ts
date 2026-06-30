// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
export interface PlanEntry {
  mode_key: string;
  rows: number;
  cols: number;
  beat_numbers: number[];
  location: string;
  padding_count: number;
  reasons: string[];
  warnings: string[];
}

export interface RenderPlan {
  plan: PlanEntry[];
  plan_hash: string;
  input_fingerprint: string;
  strategy: "location";
  total_beats: number;
  total_grids: number;
}

export interface RenderExecuteResult {
  task_type: "render_plan";
  message: string;
  /** Umbrella planning scope (e.g. `location__…`) — does NOT match any task row. */
  scope: string;
  resolved_grids: PlanEntry[];
  /** One `selected_regen` task id per resolved grid. Track these for completion. */
  task_ids: string[];
}

export interface RenderPlanStaleError {
  error: "input_stale" | "plan_stale";
  data: {
    new_plan: PlanEntry[];
    new_plan_hash: string;
    new_input_fingerprint: string;
  };
}

export interface RenderPlanFeatureDisabledError {
  error: "feature_disabled";
  data: { reason: string };
}
