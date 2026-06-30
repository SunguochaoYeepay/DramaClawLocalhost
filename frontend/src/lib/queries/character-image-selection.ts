// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { p } from "@/lib/api-path";
import type { OkResponse } from "@/types/api";

export type CharacterImageSelection = {
  character_image_selection: string;
  options: Record<string, string>;
};

export type CharacterImageUsage = {
  today_requests: number;
  total_requests: number;
};

export const characterImageSelectionQueryKey = (project: string) =>
  ["projects", project, "character-image-selection"] as const;

export const characterImageUsageQueryKey = (project: string) =>
  ["projects", project, "character-image-usage"] as const;

export function useCharacterImageSelection(project: string) {
  return useQuery({
    queryKey: characterImageSelectionQueryKey(project),
    queryFn: ({ signal }) =>
      api
        .get(p`api/v1/projects/${project}/character-image-selection`, { signal })
        .json<OkResponse<CharacterImageSelection>>(),
    enabled: !!project,
  });
}

export function useCharacterImageUsage(project: string) {
  return useQuery({
    queryKey: characterImageUsageQueryKey(project),
    queryFn: ({ signal }) =>
      api
        .get(p`api/v1/projects/${project}/character-image-usage`, { signal })
        .json<OkResponse<CharacterImageUsage>>(),
    enabled: !!project,
  });
}

export function useUpdateCharacterImageSelection(project: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (characterImageSelection: string) =>
      api
        .patch(p`api/v1/projects/${project}/character-image-selection`, {
          json: { character_image_selection: characterImageSelection },
        })
        .json<OkResponse<CharacterImageSelection>>(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterImageSelectionQueryKey(project),
      });
    },
  });
}
