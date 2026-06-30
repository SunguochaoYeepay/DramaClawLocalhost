// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { p } from "@/lib/api-path";
import type { ErrorResponse, TaskResponse } from "@/types/api";

export interface GenerateAudioParams {
  beatNumbers?: number[];
  mode?: "sync_changed" | "redo_selected" | string;
}

export function useGenerateAudio(project: string, episode: number) {
  return useMutation({
    mutationFn: (params?: GenerateAudioParams) => {
      const body: { beat_numbers?: number[]; mode?: string } = {};
      if (params?.beatNumbers) body.beat_numbers = params.beatNumbers;
      if (params?.mode) body.mode = params.mode;
      return api
        .post(p`api/v1/projects/${project}/episodes/${episode}/audio/generate`, {
          json: body,
        })
        .json<TaskResponse | ErrorResponse>();
    },
  });
}

export function useRegenerateBeatAudio(project: string, episode: number) {
  return useMutation({
    mutationFn: (beatNum: number) =>
      api
        .post(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/audio`,
        )
        .json<TaskResponse | ErrorResponse>(),
  });
}
