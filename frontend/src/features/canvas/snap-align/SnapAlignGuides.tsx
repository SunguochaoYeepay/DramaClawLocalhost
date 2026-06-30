// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useViewport } from '@xyflow/react';

import { useSnapAlignStore } from './snapAlignStore';

/**
 * 蓝色虚线对齐引导：拖动节点时绘制。线本身在 flow 坐标里是常值（x 或 y 固定），
 * 需要乘上 viewport 缩放并加上平移得到屏幕坐标。SVG 满铺画布父级，pointer-events
 * 关掉避免抢拖拽事件。
 */
export function SnapAlignGuides() {
  const guides = useSnapAlignStore((state) => state.guides);
  const { x: vx, y: vy, zoom } = useViewport();

  if (guides.vertical.length === 0 && guides.horizontal.length === 0) {
    return null;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
      style={{ overflow: 'visible' }}
    >
      {guides.vertical.map((xFlow) => {
        const xScreen = vx + xFlow * zoom;
        return (
          <line
            key={`v-${xFlow}`}
            x1={xScreen}
            x2={xScreen}
            y1={0}
            y2="100%"
            stroke="rgb(96, 165, 250)"
            strokeWidth={1}
            strokeDasharray="6 6"
          />
        );
      })}
      {guides.horizontal.map((yFlow) => {
        const yScreen = vy + yFlow * zoom;
        return (
          <line
            key={`h-${yFlow}`}
            y1={yScreen}
            y2={yScreen}
            x1={0}
            x2="100%"
            stroke="rgb(96, 165, 250)"
            strokeWidth={1}
            strokeDasharray="6 6"
          />
        );
      })}
    </svg>
  );
}
