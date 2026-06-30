// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useMutation, useQuery } from "@tanstack/react-query";
import { listFreezoneCanvases } from "@/api/canvas";
import {
  listFreezoneBeatContext,
  listFreezoneProjectAssets,
} from "@/api/projects";
import { api } from "@/lib/api";
import { p } from "@/lib/api-path";
import { queryKeys } from "@/lib/query-keys";
import type { OkResponse } from "@/types/api";

export type FreezonePresetCanvasRequest =
  | {
      scope: "episode";
      episode: number;
    }
  | {
      scope: "beat";
      episode: number;
      beat: number;
      primary_slot?: "sketch" | "frame" | "render" | string;
    }
  | {
      scope: "asset";
      asset_kind: "character";
      character: string;
    }
  | {
      scope: "asset";
      asset_kind: "portrait";
      character: string;
    }
  | {
      scope: "asset";
      asset_kind: "identity";
      character: string;
      identity_id: string;
    }
  | {
      scope: "asset";
      asset_kind: "prop" | "prop_ref";
      asset_id: string;
    }
  | {
      scope: "asset";
      asset_kind: "scene";
      asset_id: string;
    };

export interface FreezonePresetCanvasData {
  canvas_id: string;
  reused: boolean;
  url: string;
}

export function createFreezonePresetCanvas(project: string, data: FreezonePresetCanvasRequest) {
  return api
    .post(p`api/v1/projects/${project}/freezone/canvases:from-preset`, { json: data })
    .json<OkResponse<FreezonePresetCanvasData>>();
}

export function useCreateFreezonePresetCanvas(project: string) {
  return useMutation({
    mutationFn: (data: FreezonePresetCanvasRequest) =>
      createFreezonePresetCanvas(project, data),
  });
}

export function useFreezoneCanvases(
  project: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: project
      ? queryKeys.freezoneCanvases(project)
      : ["projects", "__missing__", "freezone", "canvases"],
    queryFn: ({ signal }) => {
      if (!project) {
        throw new Error("project is required");
      }
      return listFreezoneCanvases(project, { signal });
    },
    enabled: enabled && Boolean(project),
    staleTime: 15_000,
  });
}

export function useFreezoneProjectAssets(
  project: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: project
      ? queryKeys.freezoneProjectAssets(project)
      : ["projects", "__missing__", "freezone", "assets"],
    queryFn: ({ signal }) => {
      if (!project) {
        throw new Error("project is required");
      }
      return listFreezoneProjectAssets(project, { signal });
    },
    enabled: enabled && Boolean(project),
    staleTime: 15_000,
  });
}

export function useFreezoneBeatContext(
  project: string | null | undefined,
  opts: { episode?: number | null; beat?: number | null } = {},
  enabled = true,
) {
  const episode = typeof opts.episode === "number" ? opts.episode : null;
  const beat = typeof opts.beat === "number" ? opts.beat : null;
  return useQuery({
    queryKey: project
      ? queryKeys.freezoneBeatContext(project, episode, beat)
      : ["projects", "__missing__", "freezone", "beat-context", episode, beat],
    queryFn: ({ signal }) => {
      if (!project) {
        throw new Error("project is required");
      }
      return listFreezoneBeatContext(project, {
        ...(episode !== null ? { episode } : {}),
        ...(beat !== null ? { beat } : {}),
        signal,
      });
    },
    enabled: enabled && Boolean(project),
    staleTime: 15_000,
  });
}
