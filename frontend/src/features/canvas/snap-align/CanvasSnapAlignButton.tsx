// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { Magnet } from 'lucide-react';

import {
  CANVAS_CONTROL_ICON_BUTTON_ACTIVE_CLASS,
  CANVAS_CONTROL_ICON_BUTTON_CLASS,
} from '../ui/canvasControlStyles';
import { useSnapAlignStore } from './snapAlignStore';

interface CanvasSnapAlignButtonProps {
  placement?: 'bottom-right' | 'top-right';
}

export function CanvasSnapAlignButton({
  placement = 'bottom-right',
}: CanvasSnapAlignButtonProps) {
  const enabled = useSnapAlignStore((state) => state.enabled);
  const toggle = useSnapAlignStore((state) => state.toggle);
  const isTop = placement === 'top-right';
  return (
    <div
      className={`nopan nowheel pointer-events-auto group absolute right-12 z-30 ${
        isTop ? 'top-3' : 'bottom-3'
      }`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={toggle}
        className={`${CANVAS_CONTROL_ICON_BUTTON_CLASS} ${
          enabled
            ? CANVAS_CONTROL_ICON_BUTTON_ACTIVE_CLASS
            : 'text-text-muted hover:bg-white/10 hover:text-text'
        }`}
        aria-pressed={enabled}
        aria-label={enabled ? '关闭对齐吸附' : '开启对齐吸附'}
      >
        <Magnet className="h-3.5 w-3.5" />
      </button>
      <span
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[rgba(255,255,255,0.12)] bg-bg-dark/95 px-2 py-1 text-[11px] text-text-dark opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 ${
          isTop ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
        }`}
      >
        {enabled ? '关闭对齐吸附' : '开启对齐吸附'}
      </span>
    </div>
  );
}
