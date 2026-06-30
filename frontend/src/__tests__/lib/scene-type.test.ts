// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, expect, it } from "vitest";

import { SCENE_TYPE_OPTIONS, sceneTypeLabel } from "@/lib/scene-type";

describe("scene type labels", () => {
  it("uses Chinese labels for canonical scene type values", () => {
    expect(SCENE_TYPE_OPTIONS).toEqual([
      { value: "interior", label: "室内" },
      { value: "exterior", label: "室外" },
      { value: "mixed", label: "室内外" },
      { value: "other", label: "其他" },
    ]);
    expect(sceneTypeLabel("interior")).toBe("室内");
    expect(sceneTypeLabel("exterior")).toBe("室外");
  });

  it("keeps unknown legacy values readable", () => {
    expect(sceneTypeLabel("underground")).toBe("underground");
    expect(sceneTypeLabel("")).toBe("");
  });
});
