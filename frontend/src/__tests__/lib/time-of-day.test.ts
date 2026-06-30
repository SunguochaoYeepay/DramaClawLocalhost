// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, expect, it } from "vitest";

import {
  STANDARD_TIME_OF_DAY_OPTIONS,
  timeOfDayLabel,
  timeOfDayOptions,
} from "@/lib/time-of-day";

describe("time-of-day helpers", () => {
  it("exposes the closed standard list without the none value", () => {
    expect(STANDARD_TIME_OF_DAY_OPTIONS).toEqual([
      "清晨",
      "上午",
      "正午",
      "午后",
      "白天",
      "黄昏",
      "夜晚",
    ]);
  });

  it("appends non-standard current values as legacy choices", () => {
    expect(timeOfDayOptions("亥时")).toEqual([
      "清晨",
      "上午",
      "正午",
      "午后",
      "白天",
      "黄昏",
      "夜晚",
      "亥时",
    ]);
  });

  it("labels empty and legacy values explicitly", () => {
    expect(timeOfDayLabel("")).toBe("无（保持场景图光线，不重打光）");
    expect(timeOfDayLabel("白天")).toBe("白天");
    expect(timeOfDayLabel("夜晚")).toBe("夜晚");
    expect(timeOfDayLabel("亥时")).toBe("亥时（剧本原值）");
  });
});
