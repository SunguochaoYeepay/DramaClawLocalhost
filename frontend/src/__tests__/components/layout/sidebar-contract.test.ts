// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Sidebar layout contract", () => {
  it("keeps Freezone featured above the main project group and tasks separated below", () => {
    const sidebar = read("src/components/layout/sidebar.tsx");
    const navRender = sidebar.slice(sidebar.indexOf("<nav"));
    const featuredItemsIndex = navRender.indexOf("featuredProjectItems.map");
    const primaryItemsIndex = navRender.indexOf("primaryProjectItems.map");
    const assistantIndex = navRender.indexOf('labelKey: "nav.aiAssistant"');
    const styleItemsIndex = navRender.indexOf("styleProjectItems.map");
    const firstDividerIndex = navRender.indexOf("border-t border-white/[0.035]");
    const secondDividerIndex = navRender.indexOf(
      "border-t border-white/[0.035]",
      firstDividerIndex + 1,
    );
    const utilityItemsIndex = navRender.indexOf("utilityProjectItems.map");

    expect(sidebar).toContain('labelKey: "nav.freezone"');
    expect(sidebar).toContain('to: "/projects/$project/freezone"');
    expect(sidebar).toContain('rememberKey: "episodes"');
    expect(sidebar).toContain("lastEpisodeLocationByProject");
    expect(sidebar).toContain("setLastEpisodeLocation");
    expect(sidebar).toContain("clearLastEpisodeLocation");
    expect(sidebar).toContain("projectItems.slice(0, 1)");
    expect(sidebar).toContain("projectItems.slice(1, 4)");
    expect(sidebar).toContain("projectItems.slice(4, 5)");
    expect(featuredItemsIndex).toBeGreaterThan(-1);
    expect(firstDividerIndex).toBeGreaterThan(featuredItemsIndex);
    expect(primaryItemsIndex).toBeGreaterThan(-1);
    expect(primaryItemsIndex).toBeGreaterThan(firstDividerIndex);
    expect(assistantIndex).toBeGreaterThan(primaryItemsIndex);
    expect(styleItemsIndex).toBeGreaterThan(assistantIndex);
    expect(secondDividerIndex).toBeGreaterThan(styleItemsIndex);
    expect(utilityItemsIndex).toBeGreaterThan(secondDividerIndex);
  });
});
