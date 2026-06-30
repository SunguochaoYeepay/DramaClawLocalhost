// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  "src/routes/_app/projects.$project/episodes.tsx",
  "utf-8",
);

describe("episodes workbench integration", () => {
  it("wires NiceGUI-style stats and manual refresh into the episode list", () => {
    expect(routeSource).toContain("deriveEpisodeStats");
    expect(routeSource).toContain("EpisodeStatsStrip");
    expect(routeSource).toContain("handleRefresh");
    expect(routeSource).toContain("episode.list.stats.totalEpisodes");
    expect(routeSource).toContain("episode.list.refresh");
  });

  it("wires list-card identity, scene, and prop planning shortcuts", () => {
    expect(routeSource).toContain("usePlanIdentities");
    expect(routeSource).toContain("usePlanEpisodeScenes");
    expect(routeSource).toContain("usePlanEpisodeProps");
    expect(routeSource).toContain('taskType: "identity_planner"');
    expect(routeSource).toContain("onPlanScenes");
    expect(routeSource).toContain("onPlanProps");
    expect(routeSource).toContain("episode.list.planIdentities");
    expect(routeSource).toContain("episode.list.planScenes");
    expect(routeSource).toContain("episode.list.planProps");
  });

  it("scopes list-card planning spinners to the clicked episode", () => {
    expect(routeSource).toContain("planIdentities.isPending || identityTask.started");
    expect(routeSource).toContain('taskType: "identity_planner"');
    expect(routeSource).toContain("planScenes.variables === ep.number");
    expect(routeSource).toContain("planProps.variables === ep.number");
    expect(routeSource).toContain("sceneDisabled={planScenes.isPending}");
    expect(routeSource).toContain("propDisabled={planProps.isPending}");
  });

  it("shows only one episode planning action for the list state", () => {
    expect(routeSource).toContain("showPlan={!selectedEpisode && displayEpisodes.length === 0}");
    expect(routeSource).toContain("showReplan={!selectedEpisode && displayEpisodes.length > 0}");
  });

  it("uses localized copy for the episode detail back action", () => {
    expect(routeSource).toContain('t("episode.list.backToEpisodes")');
    expect(routeSource).not.toContain("返回剧集列表");
  });
});
