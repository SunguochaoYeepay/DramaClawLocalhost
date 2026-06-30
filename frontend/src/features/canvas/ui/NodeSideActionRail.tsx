// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { NodeToolbar as ReactFlowNodeToolbar, Position, useStore } from '@xyflow/react';
import { useState, type ReactNode } from 'react';

import { useCanvasStore } from '@/stores/canvasStore';

interface NodeSideActionRailProps {
  nodeId: string;
  position?: Position.Left | Position.Right;
  children: ReactNode;
  /**
   * 仅在节点被 hover 或选中时显示这条按钮栏（默认 false = 恒显示，保持
   * 上传/音频节点把上传当主操作的原有行为）。视频/图片节点的上传按钮接入它，
   * 避免在画布上一直显眼。
   */
  autoHide?: boolean;
  /** 节点是否被选中（autoHide 时用于「选中也显示」）。 */
  selected?: boolean;
}

// NodeToolbar 默认恒定屏幕尺寸（不随缩放变化），于是整理画布缩小后节点变成缩略图、
// 这条上传/替换按钮栏却仍是原大小，显得格外突兀。和 NodeSpawnPlusOverlay 的「+」一致，
// 让它跟随画布 zoom 缩放：缩小时一起变小，夹下限避免太小到点不准；上限为 1，保证放大态
// 维持原有恒定尺寸、不会反而被撑大。
const RAIL_SCALE_MIN = 0.6;
const RAIL_SCALE_MAX = 1;

export const NODE_SIDE_ACTION_BUTTON_CLASS =
  'nodrag inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-white/10 bg-[#242426]/95 px-3 text-xs font-medium text-text-dark backdrop-blur-xl transition-colors hover:border-white/18 hover:bg-[#29292b]/95 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

export const NODE_SIDE_ACTION_ICON_CLASS = 'h-3.5 w-3.5 text-text-muted/90';

export function NodeSideActionRail({
  nodeId,
  position = Position.Right,
  children,
  autoHide = false,
  selected = false,
}: NodeSideActionRailProps) {
  const isLeft = position === Position.Left;
  // 缩放比例改用根元素的 --st-canvas-zoom CSS 变量(Canvas 单一写入器维护),夹在
  // [MIN, MAX] 之间。不再 useStore 订阅 zoom —— 缩放时本栏不会因 zoom 变化而重渲染。
  const railScaleStyle = `clamp(${RAIL_SCALE_MIN}, var(--st-canvas-zoom, 1), ${RAIL_SCALE_MAX})`;
  // Canvas 维护的节点 hover（离开带 400ms 延迟，桥接「从节点移到上方按钮」的
  // 空隙）；railHovered 进一步保证鼠标停在按钮栏上时不被那个延迟清掉而隐藏。
  const nodeHovered = useCanvasStore((state) => state.hoveredNodeId === nodeId);
  const [railHovered, setRailHovered] = useState(false);
  const isVisible = !autoHide || selected || nodeHovered || railHovered;
  // 把这条按钮栏抬到同节点的 spawn「+」(NodeSpawnPlusOverlay) 之上。两者都是
  // 同一节点的 NodeToolbar，xyflow 给它们同一个 zIndex(node.internals.z + 1);
  // 「+」在 Canvas 层后渲染，平局时 DOM 顺序更靠后而盖在上面，它那块 80px 的隐形
  // 磁吸命中区会压住「上传」按钮、把点击吃掉(磁吸还会把「+」吸到按钮上)。这里给
  // 按钮栏 +2,确保按钮永远在「+」之上接收 hover/点击(光标落到按钮上时「+」自动退回)。
  const nodeZ = useStore((state) => state.nodeLookup.get(nodeId)?.internals.z ?? 0);
  return (
    <ReactFlowNodeToolbar
      nodeId={nodeId}
      isVisible={isVisible}
      position={position}
      align="start"
      offset={18}
      className="pointer-events-auto"
      style={{ zIndex: nodeZ + 2 }}
    >
      {/*
        Lift the rail to sit just above the node's top-right corner. The spawn
        "+" (NodeSpawnPlusOverlay) lives on the same right edge but vertically
        centered, so a top-aligned rail collides with it on short nodes (audio)
        — worse now that the "+" scales with zoom. Anchoring the rail above the
        node's top edge keeps it clear of the centered "+" at any zoom/height,
        while staying below the top action toolbar (which is horizontally
        centered, so the two never share screen space).
      */}
      <div
        style={{ transform: "translateY(calc(-100% - 2px))" }}
        onMouseEnter={() => setRailHovered(true)}
        onMouseLeave={() => setRailHovered(false)}
      >
        {/* 跟随画布缩放。锚定靠近节点的下边角（右栏 bottom-left / 左栏 bottom-right），
            缩小时朝远离节点方向收拢，始终贴在节点角上。 */}
        <div
          className={`flex flex-col gap-2 ${isLeft ? 'items-end' : 'items-start'}`}
          style={{
            transform: `scale(${railScaleStyle})`,
            transformOrigin: isLeft ? "bottom right" : "bottom left",
          }}
        >
          {children}
        </div>
      </div>
    </ReactFlowNodeToolbar>
  );
}
