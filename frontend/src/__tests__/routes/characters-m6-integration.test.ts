// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  "src/routes/_app/projects.$project/characters.lazy.tsx",
  "utf-8",
);

describe("character workbench M6 integration", () => {
  it("wires search and stats into the character workbench", () => {
    expect(routeSource).toContain("CharacterSearch");
    expect(routeSource).toContain("filterCharacters");
    expect(routeSource).toContain("CharacterStatsStrip");
    expect(routeSource).toContain("useCharacterImageUsage");
    expect(routeSource).toContain("imageUsage={imageUsageRes?.data}");
    expect(routeSource).toContain("searchQuery");
    expect(routeSource).toContain("filteredCharacters");
  });

  it("wires character image source selection into generation actions", () => {
    expect(routeSource).toContain("CharacterImageSourceSelect");
    expect(routeSource).toContain("useCharacterImageSelection");
    expect(routeSource).toContain("imageModel");
    expect(routeSource).toContain("model: imageModel || undefined");
    expect(routeSource).toContain("portraitTask.start({ scope: res.scope })");
    expect(routeSource).toContain("identityImageTask.start({ scope: res.scope })");
    expect(routeSource).toContain("identityPortraitTask.start({ scope: res.scope })");
    expect(routeSource).toMatch(
      /const identityPortraitTask = useTaskController\([\s\S]*taskType: "character_portrait"/,
    );
  });

  it("shows the project visual style in the character workbench", () => {
    expect(routeSource).toContain("ProjectStyleChip");
  });

  it("persists the active asset tab per project", () => {
    expect(routeSource).toContain("ASSET_TAB_STORAGE_KEY_PREFIX");
    expect(routeSource).toContain("readStoredAssetTab(project)");
    expect(routeSource).toContain("writeStoredAssetTab(project, next)");
    expect(routeSource).toContain("setAssetTab(next)");
  });

  it("exposes project narrator voice management as an asset tab", () => {
    expect(routeSource).toContain('type AssetTab = "characters" | "scenes" | "props" | "voices"');
    expect(routeSource).toContain('const ASSET_TABS = ["characters", "scenes", "props", "voices"] as const');
    expect(routeSource).toContain('{ value: "voices", icon: Mic2 }');
    expect(routeSource).toContain("<ProjectVoicesPanel");
    expect(routeSource).toContain("<NarratorVoicePanel");
  });

  it("routes narrated first-person voice setup to the narrator main character", () => {
    expect(routeSource).toContain("isNarratedFirstPerson");
    expect(routeSource).toContain("onSelectNarratorMain");
    expect(routeSource).toContain("characters.voices.firstPersonNarratedTitle");
    expect(routeSource).toContain("allowFirstPersonProjectVoice={allowFirstPersonProjectVoice}");
  });

  it("wires costume reference deletion into identity cards", () => {
    expect(routeSource).toContain("useDeleteIdentityCostume");
    expect(routeSource).toContain("deleteCostume");
    expect(routeSource).toContain("characters.identities.deleteCostume");
  });

  it("includes age group when creating identities", () => {
    expect(routeSource).toContain("newAgeGroup");
    expect(routeSource).toContain("age_group: newAgeGroup || undefined");
  });

  it("keeps NiceGUI character rename wired through the details form", () => {
    expect(routeSource).toContain("onRenamed");
    expect(routeSource).toContain("setSelectedName(nextName)");
    expect(routeSource).toContain("characters.basics.name");
    expect(routeSource).toContain("handleBlurName");
    expect(routeSource).toContain("updateChar.mutateAsync({ name: nextName })");
  });

  it("guards identity attempt responses after character rename", () => {
    expect(routeSource).toMatch(/isOkResponse(?:<[^>]+>)?\(attemptsRes\.data\)/);
    expect(routeSource).not.toContain("attemptsRes.data?.data.image_attempts");
    expect(routeSource).not.toContain("attemptsRes.data?.data.portrait_attempts");
  });
});
