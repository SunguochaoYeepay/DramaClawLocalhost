// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSceneDirectorStageManifest } from "@/api/viewerManifests";
import { hydrateAssetDragPayload } from "@/features/canvas/domain/assetDragHydrate";
import type { CanvasAssetDragPayload } from "@/features/canvas/domain/assetDrag";
import type { ThreeDSceneSnapshot } from "@/features/viewer-kit/three-d/engine/viewerApp";
import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";

vi.mock("@/api/viewerManifests", () => ({
  getSceneDirectorStageManifest: vi.fn(),
}));

describe("hydrateAssetDragPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies a scene director world manifest into a user-imported canvas payload", async () => {
    const scene = {
      schemaVersion: 1,
      savedAt: 1,
      actors: [
        {
          label: "actor-1",
          color: "#ff3344",
          position: [0, 0, 0],
          yawDeg: 0,
          scale: [1, 1, 1],
        },
      ],
      props: [],
      stagings: [],
      camera: { azim: 1, elev: 2, distance: 3, focalPoint: [0, 0, 0] },
    } satisfies ThreeDSceneSnapshot;
    const manifest = {
      viewer_kind: "three_d_director",
      mode: "scene",
      project: "demo",
      scene_id: "公寓楼电梯间",
      display_name: "公寓楼电梯间 / 导演世界",
      source: {
        source_type: "sog",
        source_kind: "master",
        ply_url: "/static/demo/director_worlds/公寓楼电梯间/v1/master.sog",
      },
      sources: [
        {
          id: "front",
          label: "正面世界",
          source_type: "sog",
          source_kind: "master",
          ply_url: "/static/demo/director_worlds/公寓楼电梯间/v1/master.sog",
        },
        {
          id: "reverse",
          label: "背面世界",
          source_type: "sog",
          source_kind: "reverse",
          ply_url: "/static/demo/director_worlds/公寓楼电梯间/v1/reverse.sog",
        },
      ],
      active_source_id: "reverse",
      scene,
      scenes_by_source_id: {
        front: null,
        reverse: scene,
      },
      palette: { actors: [], props: [], anonymous_colors: [], anonymous_prop_colors: [] },
      allowed_destinations: ["view"],
    } satisfies DirectorStageManifest;
    vi.mocked(getSceneDirectorStageManifest).mockResolvedValueOnce(manifest);

    const payload = {
      kind: "model",
      label: "公寓楼电梯间 / 导演世界",
      url: "/static/demo/director_worlds/公寓楼电梯间/v1/reverse.sog",
      mainlineContext: [
        {
          kind: "scene",
          projectId: "demo",
          sceneId: "公寓楼电梯间",
          role: "scene_director_world",
          label: "公寓楼电梯间 / 导演世界",
        },
      ],
      source: {
        kind: "scene",
        role: "scene_director_world",
        projectId: "demo",
        meta: { scene_id: "公寓楼电梯间" },
      },
    } satisfies CanvasAssetDragPayload;

    const hydrated = await hydrateAssetDragPayload(payload);

    expect(getSceneDirectorStageManifest).toHaveBeenCalledWith("demo", "公寓楼电梯间");
    expect(hydrated.activeSourceId).toBe("reverse");
    expect(hydrated.plyUrl).toBe("/static/demo/director_worlds/公寓楼电梯间/v1/reverse.sog");
    expect(hydrated.modelSources).toEqual([
      expect.objectContaining({ id: "front", label: "正面世界" }),
      expect.objectContaining({ id: "reverse", label: "背面世界" }),
    ]);
    expect(hydrated.scene).toBe(scene);
    expect(hydrated.scenesBySourceId).toEqual({ reverse: scene });
  });

  it("leaves non scene-director-world payloads untouched", async () => {
    const payload = {
      kind: "model",
      label: "自定义 3D",
      url: "/static/demo/custom-world.sog",
      source: { kind: "scene", role: "scene_3gs_master_ply", projectId: "demo" },
    } satisfies CanvasAssetDragPayload;

    await expect(hydrateAssetDragPayload(payload)).resolves.toBe(payload);
    expect(getSceneDirectorStageManifest).not.toHaveBeenCalled();
  });
});
