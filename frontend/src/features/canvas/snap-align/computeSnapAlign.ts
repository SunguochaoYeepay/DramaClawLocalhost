// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { CanvasNode } from '@/features/canvas/domain/canvasNodes';

import type { SnapAlignGuides } from './snapAlignStore';

interface Bbox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
}

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;
/** 引导线 ↔ 拖动节点边线之间多近才算"对齐"（flow 坐标，未除缩放）。 */
export const SNAP_ALIGN_FLOW_THRESHOLD = 6;
/** 收集匹配引导线时的判等容差，用于过滤浮点误差。 */
const MATCH_EPSILON = 0.5;

function bboxAt(node: CanvasNode, pos: { x: number; y: number }): Bbox {
  const w =
    typeof node.measured?.width === 'number'
      ? node.measured.width
      : typeof node.width === 'number'
      ? node.width
      : DEFAULT_NODE_WIDTH;
  const h =
    typeof node.measured?.height === 'number'
      ? node.measured.height
      : typeof node.height === 'number'
      ? node.height
      : DEFAULT_NODE_HEIGHT;
  return {
    left: pos.x,
    right: pos.x + w,
    top: pos.y,
    bottom: pos.y + h,
    cx: pos.x + w / 2,
    cy: pos.y + h / 2,
  };
}

function nodeBbox(node: CanvasNode): Bbox {
  return bboxAt(node, node.position);
}

export interface SnapAlignResult {
  /** 吸附后的左上角位置（flow 坐标）。等于原始 proposed 加上吸附 delta。 */
  position: { x: number; y: number };
  guides: SnapAlignGuides;
}

/**
 * 预计算的对齐候选索引：把所有「其它节点」的 left/cx/right 收进排序的 xs、
 * top/cy/bottom 收进排序的 ys。单节点拖动期间其它节点不动，所以这份索引在
 * 拖动开始时构建一次即可，之后每帧只做二分查找，避免每帧 O(n) 重扫 + 重分配。
 */
export interface SnapAlignIndex {
  xs: number[];
  ys: number[];
}

export function buildSnapAlignIndex(otherNodes: CanvasNode[]): SnapAlignIndex {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const node of otherNodes) {
    const b = nodeBbox(node);
    xs.push(b.left, b.cx, b.right);
    ys.push(b.top, b.cy, b.bottom);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  return { xs, ys };
}

/** 第一个 >= target 的下标（lower bound）。 */
function lowerBound(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** 在排序数组里找与 target 距离最近、且在 threshold 内的 (coord - target)，否则 null。 */
function nearestDelta(sorted: number[], target: number, threshold: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const idx = lowerBound(sorted, target);
  let best: number | null = null;
  for (const candidate of [idx - 1, idx]) {
    if (candidate < 0 || candidate >= sorted.length) {
      continue;
    }
    const delta = sorted[candidate] - target;
    if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) {
      best = delta;
    }
  }
  return best;
}

/** 收集所有与 target 距离 < eps 的候选坐标到 out。 */
function collectWithin(sorted: number[], target: number, eps: number, out: Set<number>): void {
  for (let i = lowerBound(sorted, target - eps); i < sorted.length && sorted[i] <= target + eps; i += 1) {
    if (Math.abs(sorted[i] - target) < eps) {
      out.add(sorted[i]);
    }
  }
}

/**
 * 基于预建索引的吸附计算：与 computeSnapAlign 等价，但每帧只做二分查找而非 O(n) 全扫。
 */
export function computeSnapAlignFromIndex(
  draggedNode: CanvasNode,
  proposedPosition: { x: number; y: number },
  index: SnapAlignIndex,
  threshold: number = SNAP_ALIGN_FLOW_THRESHOLD,
): SnapAlignResult {
  if (index.xs.length === 0) {
    return { position: proposedPosition, guides: { vertical: [], horizontal: [] } };
  }
  const draggedBbox = bboxAt(draggedNode, proposedPosition);
  const dragXs = [draggedBbox.left, draggedBbox.cx, draggedBbox.right];
  const dragYs = [draggedBbox.top, draggedBbox.cy, draggedBbox.bottom];

  let bestDx: number | null = null;
  let bestDy: number | null = null;
  for (const dx of dragXs) {
    const delta = nearestDelta(index.xs, dx, threshold);
    if (delta !== null && (bestDx === null || Math.abs(delta) < Math.abs(bestDx))) {
      bestDx = delta;
    }
  }
  for (const dy of dragYs) {
    const delta = nearestDelta(index.ys, dy, threshold);
    if (delta !== null && (bestDy === null || Math.abs(delta) < Math.abs(bestDy))) {
      bestDy = delta;
    }
  }

  const snapDx = bestDx ?? 0;
  const snapDy = bestDy ?? 0;
  const snappedPosition = { x: proposedPosition.x + snapDx, y: proposedPosition.y + snapDy };
  if (snapDx === 0 && snapDy === 0) {
    return { position: snappedPosition, guides: { vertical: [], horizontal: [] } };
  }

  const snappedBbox = bboxAt(draggedNode, snappedPosition);
  const verticalSet = new Set<number>();
  const horizontalSet = new Set<number>();
  for (const sx of [snappedBbox.left, snappedBbox.cx, snappedBbox.right]) {
    collectWithin(index.xs, sx, MATCH_EPSILON, verticalSet);
  }
  for (const sy of [snappedBbox.top, snappedBbox.cy, snappedBbox.bottom]) {
    collectWithin(index.ys, sy, MATCH_EPSILON, horizontalSet);
  }

  return {
    position: snappedPosition,
    guides: {
      vertical: Array.from(verticalSet),
      horizontal: Array.from(horizontalSet),
    },
  };
}

/**
 * 给定一个候选位置，找到最近的对齐线并返回吸附后的位置 + 命中的引导线。
 *
 * - 比较的"对齐线"是 6 条：节点的 left/cx/right 与 top/cy/bottom。
 * - 在 `threshold` 内才会吸附；否则原样返回。
 * - X / Y 两个轴各自独立挑最近的一条，所以可以同时吸到一条竖线 + 一条横线。
 */
export function computeSnapAlign(
  draggedNode: CanvasNode,
  proposedPosition: { x: number; y: number },
  otherNodes: CanvasNode[],
  threshold: number = SNAP_ALIGN_FLOW_THRESHOLD,
): SnapAlignResult {
  if (otherNodes.length === 0) {
    return { position: proposedPosition, guides: { vertical: [], horizontal: [] } };
  }
  return computeSnapAlignFromIndex(
    draggedNode,
    proposedPosition,
    buildSnapAlignIndex(otherNodes),
    threshold,
  );
}
