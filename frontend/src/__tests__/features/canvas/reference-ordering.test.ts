// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, expect, it } from "vitest";

import { sortUpstreamByReferenceOrder } from "@/features/canvas/nodes/referenceOrdering";

type Node = { id: string; position?: { y?: number } };

const ids = (nodes: Node[]) => nodes.map((node) => node.id);

describe("sortUpstreamByReferenceOrder", () => {
  it("keeps newly connected nodes in connection order, ignoring canvas y position", () => {
    // 回归用例:旧图(red,先引用,在画布下方 y=900)应排在新图(grid,后引用,
    // 在画布上方 y=0)之前。曾经按 y 排序会把上方的新图错误地放到第 1 位。
    const connectionOrder: Node[] = [
      { id: "red", position: { y: 900 } },
      { id: "grid", position: { y: 0 } },
    ];

    const sorted = sortUpstreamByReferenceOrder(connectionOrder, undefined);

    expect(ids(sorted)).toEqual(["red", "grid"]);
  });

  it("honors an explicit manual referenceOrder over connection order", () => {
    const connectionOrder: Node[] = [
      { id: "a", position: { y: 0 } },
      { id: "b", position: { y: 100 } },
      { id: "c", position: { y: 200 } },
    ];

    const sorted = sortUpstreamByReferenceOrder(connectionOrder, ["c", "a", "b"]);

    expect(ids(sorted)).toEqual(["c", "a", "b"]);
  });

  it("places manually-ordered nodes first, then unordered ones in connection order", () => {
    // b 被手动拖到首位;a 和后来连入的 c、d 都不在 referenceOrder 里,
    // 应按连接顺序(输入数组顺序)接在 b 之后。
    const connectionOrder: Node[] = [
      { id: "a", position: { y: 50 } },
      { id: "b", position: { y: 999 } },
      { id: "c", position: { y: 10 } },
      { id: "d", position: { y: 5 } },
    ];

    const sorted = sortUpstreamByReferenceOrder(connectionOrder, ["b"]);

    expect(ids(sorted)).toEqual(["b", "a", "c", "d"]);
  });

  it("does not mutate the input array", () => {
    const input: Node[] = [
      { id: "x", position: { y: 1 } },
      { id: "y", position: { y: 0 } },
    ];

    sortUpstreamByReferenceOrder(input, undefined);

    expect(ids(input)).toEqual(["x", "y"]);
  });
});
