// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, expect, it } from 'vitest';

import type { CanvasNode } from '@/features/canvas/domain/canvasNodes';
import {
  computeSnapAlign,
  SNAP_ALIGN_FLOW_THRESHOLD,
} from '@/features/canvas/snap-align/computeSnapAlign';

// 暴力参考实现(等价于重构前的 O(n²) 版本),用来与索引版做 parity 对比。
function bbox(node: CanvasNode) {
  const w = (node.measured?.width ?? node.width ?? 200) as number;
  const h = (node.measured?.height ?? node.height ?? 100) as number;
  return {
    left: node.position.x,
    right: node.position.x + w,
    top: node.position.y,
    bottom: node.position.y + h,
    cx: node.position.x + w / 2,
    cy: node.position.y + h / 2,
  };
}

function brute(
  dragged: CanvasNode,
  proposed: { x: number; y: number },
  others: CanvasNode[],
  threshold = SNAP_ALIGN_FLOW_THRESHOLD,
): { x: number; y: number } {
  if (others.length === 0) return proposed;
  const d = bbox({ ...dragged, position: proposed });
  const dragXs = [d.left, d.cx, d.right];
  const dragYs = [d.top, d.cy, d.bottom];
  let bestDx: number | null = null;
  let bestDy: number | null = null;
  for (const o of others.map(bbox)) {
    for (const dx of dragXs) {
      for (const ox of [o.left, o.cx, o.right]) {
        const delta = ox - dx;
        if (Math.abs(delta) <= threshold && (bestDx === null || Math.abs(delta) < Math.abs(bestDx))) {
          bestDx = delta;
        }
      }
    }
    for (const dy of dragYs) {
      for (const oy of [o.top, o.cy, o.bottom]) {
        const delta = oy - dy;
        if (Math.abs(delta) <= threshold && (bestDy === null || Math.abs(delta) < Math.abs(bestDy))) {
          bestDy = delta;
        }
      }
    }
  }
  return { x: proposed.x + (bestDx ?? 0), y: proposed.y + (bestDy ?? 0) };
}

function makeNode(id: string, x: number, y: number, w = 200, h = 100): CanvasNode {
  return { id, position: { x, y }, width: w, height: h, data: {}, type: 'image' } as unknown as CanvasNode;
}

// 简单可重复的伪随机数(避免 Math.random 不可重复)。
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

describe('computeSnapAlign (index-based) parity', () => {
  it('snapped position matches brute-force reference across random layouts', () => {
    const rng = makeRng(42);
    for (let trial = 0; trial < 200; trial += 1) {
      const count = 1 + Math.floor(rng() * 30);
      const others: CanvasNode[] = [];
      for (let i = 0; i < count; i += 1) {
        others.push(makeNode(`n${i}`, Math.floor(rng() * 1000), Math.floor(rng() * 1000)));
      }
      const dragged = makeNode('drag', 0, 0);
      // 偏向落在某个候选边线附近,确保能命中吸附分支。
      const anchor = others[Math.floor(rng() * others.length)];
      const proposed = {
        x: anchor.position.x + Math.round((rng() - 0.5) * 14),
        y: anchor.position.y + Math.round((rng() - 0.5) * 14),
      };
      const expected = brute(dragged, proposed, others);
      const actual = computeSnapAlign(dragged, proposed, others).position;
      // 比对吸附「距离幅度」而非带符号坐标:当两条候选边线到拖拽线等距(反号平局)时,
      // 吸到任一条都同样正确,幅度相同即证明两实现都找到了真正的最近候选。
      expect(Math.abs(actual.x - proposed.x)).toBeCloseTo(Math.abs(expected.x - proposed.x), 6);
      expect(Math.abs(actual.y - proposed.y)).toBeCloseTo(Math.abs(expected.y - proposed.y), 6);
    }
  });

  it('returns proposed position unchanged when no nodes are within threshold', () => {
    const dragged = makeNode('drag', 0, 0);
    const others = [makeNode('far', 5000, 5000)];
    const result = computeSnapAlign(dragged, { x: 100, y: 100 }, others);
    expect(result.position).toEqual({ x: 100, y: 100 });
    expect(result.guides.vertical).toHaveLength(0);
    expect(result.guides.horizontal).toHaveLength(0);
  });

  it('emits guide lines when an edge snaps', () => {
    const dragged = makeNode('drag', 0, 0);
    const others = [makeNode('aligned', 0, 300)];
    // proposed left ≈ other.left → should snap and emit a vertical guide at x=0.
    const result = computeSnapAlign(dragged, { x: 3, y: 50 }, others);
    expect(result.position.x).toBe(0);
    expect(result.guides.vertical).toContain(0);
  });
});
