// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, it, expect } from "vitest";
import { sampleTask } from "@/__mocks__/msw/handlers/tasks";
import { isTerminal, isActive, ageMs, displayLabel, originDeepLink } from "@/task-center/derivations";

describe("isTerminal", () => {
  it("returns true for completed", () => expect(isTerminal(sampleTask({ status: "completed" }))).toBe(true));
  it("returns true for failed", () => expect(isTerminal(sampleTask({ status: "failed" }))).toBe(true));
  it("returns false for running", () => expect(isTerminal(sampleTask({ status: "running" }))).toBe(false));
  it("returns false for submitting", () => expect(isTerminal(sampleTask({ status: "submitting" }))).toBe(false));
  it("returns false for pending", () => expect(isTerminal(sampleTask({ status: "pending" }))).toBe(false));
  it("returns false for starting", () => expect(isTerminal(sampleTask({ status: "starting" }))).toBe(false));
});

describe("isActive", () => {
  it("returns true for submitting/queued/pending/starting/running", () => {
    expect(isActive(sampleTask({ status: "submitting" }))).toBe(true);
    expect(isActive(sampleTask({ status: "queued" }))).toBe(true);
    expect(isActive(sampleTask({ status: "pending" }))).toBe(true);
    expect(isActive(sampleTask({ status: "starting" }))).toBe(true);
    expect(isActive(sampleTask({ status: "running" }))).toBe(true);
  });
  it("returns false for terminal", () => {
    expect(isActive(sampleTask({ status: "completed" }))).toBe(false);
    expect(isActive(sampleTask({ status: "failed" }))).toBe(false);
  });
});

describe("ageMs", () => {
  it("computes ms since updated_at", () => {
    const task = sampleTask({ updated_at: "2026-04-18T14:33:12Z" });
    const now = new Date("2026-04-18T14:33:42Z").getTime();
    expect(ageMs(task, now)).toBe(30_000);
  });
});

describe("displayLabel", () => {
  const t = (k: string, opts?: Record<string, unknown>) => (opts ? `${k}(${JSON.stringify(opts)})` : k);
  it("localizes base task type", () => {
    expect(displayLabel(sampleTask({ task_type: "sketch_regen", episode: 3 }), t)).toBe(
      "tasks.types.sketch_regen · ep3",
    );
  });
  it("uses backend display name when present", () => {
    expect(
      displayLabel(
        sampleTask({
          task_type: "episode_scene_planner",
          episode: 3,
          display_name: "规划场景 · ep3",
        }),
        t,
      ),
    ).toBe("规划场景 · ep3");
  });
  it("appends beat when present", () => {
    expect(displayLabel(sampleTask({ task_type: "single_video", episode: 3, beat_num: 7 }), t)).toBe(
      "tasks.types.single_video · ep3 · beat 7",
    );
  });
  it("appends scope when present", () => {
    expect(displayLabel(sampleTask({ task_type: "sketch_regen", episode: 3, scope: "regen__abc" }), t)).toBe(
      "tasks.types.sketch_regen · ep3 · regen__abc",
    );
  });
  it("hides internal episode asset planner run scopes", () => {
    expect(
      displayLabel(
        sampleTask({
          task_type: "episode_scene_planner",
          episode: 3,
          scope: "scene_run_abc123",
        }),
        t,
      ),
    ).toBe("tasks.types.episode_scene_planner · ep3");
    expect(
      displayLabel(
        sampleTask({
          task_type: "episode_prop_planner",
          episode: 3,
          scope: "prop_run_abc123",
        }),
        t,
      ),
    ).toBe("tasks.types.episode_prop_planner · ep3");
  });
});

describe("originDeepLink", () => {
  it("returns route info for sketch-family tasks", () => {
    const link = originDeepLink(sampleTask({ task_type: "sketch_regen", project: "demo", episode: 3 }));
    expect(link).toEqual({
      to: "/projects/$project/episodes/$episode/sketches",
      params: { project: "demo", episode: "3" },
    });
  });
  it("returns null for project-level task types (no episode stage)", () => {
    expect(originDeepLink(sampleTask({ task_type: "build_characters" }))).toBeNull();
  });
  it("returns null for unknown task types", () => {
    expect(originDeepLink(sampleTask({ task_type: "no_such_type_ever" }))).toBeNull();
  });
});
