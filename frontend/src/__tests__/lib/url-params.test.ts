// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, expect, it } from "vitest";

import { writeUrl } from "@/lib/url-params";

describe("freezone url params", () => {
  it("does not rewrite non-freezone routes when stale freezone code writes canvas state", () => {
    window.history.pushState(null, "", "/projects/proj-a/episodes/3/script");

    writeUrl({ canvas: "canvas-2" });

    expect(window.location.pathname).toBe("/projects/proj-a/episodes/3/script");
    expect(window.location.search).toBe("");
  });

  it("writes canvas params while on the project freezone route", () => {
    window.history.pushState(null, "", "/projects/proj-a/freezone");

    writeUrl({ canvas: "canvas-2" });

    expect(window.location.pathname).toBe("/projects/proj-a/freezone");
    expect(window.location.search).toBe("?canvas=canvas-2");
  });

  it("can replace canvas params without notifying route listeners", () => {
    window.history.pushState(null, "", "/projects/proj-a/freezone");
    let popstateCount = 0;
    const listener = () => {
      popstateCount += 1;
    };
    window.addEventListener("popstate", listener);

    try {
      writeUrl({ canvas: "canvas-2" }, { replace: true, notify: false });

      expect(window.location.pathname).toBe("/projects/proj-a/freezone");
      expect(window.location.search).toBe("?canvas=canvas-2");
      expect(popstateCount).toBe(0);
    } finally {
      window.removeEventListener("popstate", listener);
    }
  });
});
