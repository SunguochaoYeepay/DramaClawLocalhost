// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("advanced NiceGUI feature skip contract", () => {
  it("keeps unfinished P2 entrances off active React workbench surfaces", () => {
    const beatWorkbenchSurface = [
      "src/routes/_app/projects.$project/episodes.$episode/beats.lazy.tsx",
      "src/components/episode/beat-workbench/sketch-section.tsx",
      "src/components/episode/beat-workbench/render-section.tsx",
      "src/components/episode/beat-workbench/sketch-studio-actions.tsx",
      "src/components/episode/beat-workbench/batch-bar.tsx",
    ]
      .map(read)
      .join("\n");

    // P2-4A is restored for the Beat workbench via the current 3GS Slate /
    // selected-background flow. Hidden voxel and action-sketch surfaces remain out.
    expect(beatWorkbenchSurface).toContain("useBeatDirectorStageManifest");
    expect(beatWorkbenchSurface).not.toContain("voxel");
    expect(beatWorkbenchSurface).not.toContain("Action Beat");
    expect(beatWorkbenchSurface).not.toContain("action-sketch");

    const assetSurface = [
      "src/components/assets/scene-asset-card.tsx",
      "src/components/assets/scenes-panel.tsx",
    ]
      .map(read)
      .join("\n");

    // P2-4A is restored on the asset board: current NiceGUI active 3GS stage
    // controls are allowed here, while hidden experimental voxel remains out.
    expect(assetSurface).toContain("stage_3gs");
    expect(assetSurface).toContain("SceneStagePlySource");
    expect(assetSurface).toContain("useSceneDirectorStageManifest");
    expect(assetSurface).not.toContain("voxel");
  });

  it("documents advanced feature decisions including pose editor inclusion and P2 backlog", () => {
    const doc = read("docs/specs/nicegui-sidebar/99-advanced-decisions.md");

    expect(doc).toContain("P1-1");
    expect(doc).toContain("P2-2");
    expect(doc).toContain("P2-3");
    expect(doc).toContain("P2-4");
    expect(doc).toContain("IN SCOPE：用户确认需要");
    expect(doc).toContain("保存回 canonical sketch");
    expect(doc).toContain("CANCELLED：用户确认没用，不做；不补 FastAPI route/query/UI");
    expect(doc).toContain("Beat 级 Freezone preset 入口已恢复");
    expect(doc).toContain("primary_slot=frame");
    expect(doc).toContain("P2-4A");
    expect(doc).toContain("p2-backlog.md");
    expect(doc).toContain("p2-4-assets-3gs-voxel-ply-directorstage.md");
  });
});
