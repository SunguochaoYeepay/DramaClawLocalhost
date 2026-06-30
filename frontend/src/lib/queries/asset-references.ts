// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { p } from "@/lib/api-path";
import { queryKeys } from "@/lib/query-keys";
import type { OkResponse } from "@/types/api";
import type { Beat, Episode } from "@/types/episode";

/**
 * Client-side cross-asset reference index.
 *
 * The backend does not (yet) expose `GET /assets/{type}/{id}/references`, so we
 * derive "which beats use this asset" on the FE from data already present on
 * each beat:
 *   - identities → `beat.detected_identities` (matched by `identity_id`)
 *   - props      → `beat.detected_props` (sketch color-bound) UNION the
 *                  `[[prop]]` markers inside `beat.visual_description`
 *                  (matched by prop `name`)
 *   - scenes     → `beat.scene_ref.scene_id`  (matched by scene `name`)
 *
 * Props have two carriers: a prop is "in" a beat when it is either color-bound
 * on the sketch (`detected_props`) OR marked inline in the visual description
 * as `[[name]]` — the sketch workbench renders both, so the reverse index must
 * count both, otherwise a prop referenced only via the text marker (never
 * color-bound) would show zero beats.
 *
 * Matching caveat: identity matching is exact (`detected_identities` carries
 * `identity_id`). Prop/scene ids are assumed to equal the asset `name`; if the
 * backend later diverges (slug vs name), swap the key builders below. Once the
 * backend ships a references endpoint, replace the aggregation here and keep
 * the public shape.
 */

export type AssetRefType = "identity" | "scene" | "prop";

export interface BeatReference {
  episode: number;
  beatNumber: number;
}

/** Identities + props that share a beat with a given scene. */
export interface SceneCoOccurrence {
  identities: string[];
  props: string[];
}

export interface AssetReferenceIndex {
  /** Lookup references for one asset. Empty array when none / still loading. */
  referencesFor: (type: AssetRefType, id: string) => BeatReference[];
  /** Convenience: usage count for one asset. */
  countFor: (type: AssetRefType, id: string) => number;
  /** Identities/props co-appearing in beats where this scene is used. */
  coOccurrenceForScene: (sceneId: string) => SceneCoOccurrence;
  /** True while any episode's beats are still loading. */
  isLoading: boolean;
}

function refKey(type: AssetRefType, id: string): string {
  return `${type}:${id}`;
}

const EMPTY: BeatReference[] = [];
const EMPTY_CO: SceneCoOccurrence = { identities: [], props: [] };

/** Inline `[[prop]]` markers inside a beat's visual description. */
function extractMarkedProps(visualDescription: string): string[] {
  const out: string[] = [];
  for (const m of visualDescription.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const id = (m[1] ?? "").trim();
    if (id) out.push(id);
  }
  return out;
}

export function useAssetReferenceIndex(project: string): AssetReferenceIndex {
  const episodesRes = useQuery({
    queryKey: queryKeys.episodes(project),
    queryFn: ({ signal }) =>
      api
        .get(p`api/v1/projects/${project}/episodes`, { signal })
        .json<OkResponse<Episode[]>>(),
    enabled: !!project,
  });

  const episodeNumbers = useMemo(
    () => (episodesRes.data?.data ?? []).map((e) => e.number),
    [episodesRes.data?.data],
  );

  const beatQueries = useQueries({
    queries: episodeNumbers.map((episode) => ({
      queryKey: queryKeys.beats(project, episode),
      queryFn: ({ signal }: QueryFunctionContext) =>
        api
          .get(p`api/v1/projects/${project}/episodes/${episode}/beats`, {
            signal,
          })
          .json<OkResponse<Beat[]>>(),
      enabled: !!project && episode > 0,
    })),
  });

  const isLoading =
    episodesRes.isLoading || beatQueries.some((q) => q.isLoading);

  // Stable, fixed-shape dependency: the deps array length must not vary across
  // renders, so collapse all per-episode query freshness into one signature.
  const dataSignature = beatQueries
    .map((q) => q.dataUpdatedAt)
    .join(",");
  const beatsByEpisode = beatQueries.map((q) => q.data?.data);

  const { map, sceneCo } = useMemo(() => {
    const acc = new Map<string, BeatReference[]>();
    const co = new Map<string, { identities: Set<string>; props: Set<string> }>();
    const push = (key: string, ref: BeatReference) => {
      const prev = acc.get(key);
      if (prev) prev.push(ref);
      else acc.set(key, [ref]);
    };
    beatsByEpisode.forEach((beats, i) => {
      const episode = episodeNumbers[i];
      if (!beats) return;
      for (const beat of beats) {
        const ref: BeatReference = { episode, beatNumber: beat.beat_number };
        const beatIdentities = beat.detected_identities ?? [];
        const beatProps = [
          ...new Set([
            ...(beat.detected_props ?? []),
            ...extractMarkedProps(beat.visual_description ?? ""),
          ]),
        ];
        for (const id of beatIdentities) {
          push(refKey("identity", id), ref);
        }
        for (const id of beatProps) {
          push(refKey("prop", id), ref);
        }
        const sceneId = beat.scene_ref?.scene_id;
        if (sceneId) {
          push(refKey("scene", sceneId), ref);
          let bucket = co.get(sceneId);
          if (!bucket) {
            bucket = { identities: new Set(), props: new Set() };
            co.set(sceneId, bucket);
          }
          for (const id of beatIdentities) bucket.identities.add(id);
          for (const id of beatProps) bucket.props.add(id);
        }
      }
    });
    return { map: acc, sceneCo: co };
  }, [episodeNumbers, dataSignature]);

  return useMemo(
    () => ({
      referencesFor: (type, id) => map.get(refKey(type, id)) ?? EMPTY,
      countFor: (type, id) => map.get(refKey(type, id))?.length ?? 0,
      coOccurrenceForScene: (sceneId) => {
        const bucket = sceneCo.get(sceneId);
        if (!bucket) return EMPTY_CO;
        return {
          identities: [...bucket.identities].sort((a, b) => a.localeCompare(b)),
          props: [...bucket.props].sort((a, b) => a.localeCompare(b)),
        };
      },
      isLoading,
    }),
    [map, sceneCo, isLoading],
  );
}
