// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("NiceGUI sidebar feature map contract", () => {
  it("does not leave unresolved table status cells in the sidebar map", () => {
    const doc = read("docs/specs/nicegui-sidebar-feature-map.md");
    const tableRows = doc
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.includes("---"));

    for (const row of tableRows) {
      expect(row).not.toMatch(/\|\s*(MISSING|UNKNOWN|PARTIAL)\s*\|/);
      expect(row).not.toMatch(/\b(?:DONE\s*\/\s*PARTIAL|PARTIAL\s*\/\s*P\d+)\b/);
    }
  });
});
