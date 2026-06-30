// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
export interface OkResponse<T> {
  ok: true;
  data: T;
}

export interface TaskResponse {
  ok: true;
  task_type: string;
  task_id?: string;
  task_key?: string;
  message: string;
  /**
   * Server-computed scope for tasks where the FE can't derive it itself
   * (e.g. `selection_scope(mode_key, beat_indices)` for sketch_regen).
   * Pass into `useTaskController.start({ scope })` so the SSE stream URL
   * can filter to the exact task row on first open, instead of racing
   * reconcile to discover it via `/tasks` poll.
   */
  scope?: string;
}

export interface ErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = OkResponse<T> | ErrorResponse;
