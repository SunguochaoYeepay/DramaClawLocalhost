// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
export type PoseName =
  | 'standing'
  | 'talking'
  | 'arms_crossed'
  | 'sitting'
  | 'eating'
  | 'crouching'
  | 'kneeling'
  | 'lying'
  | 'walking'
  | 'running'
  | 'pointing'
  | 'holding'
  | 'interacting'
  | 'fighting'
  | 'sword';

export const POSES: PoseName[] = [
  'standing',
  'talking',
  'arms_crossed',
  'sitting',
  'eating',
  'crouching',
  'kneeling',
  'lying',
  'walking',
  'running',
  'pointing',
  'holding',
  'interacting',
  'fighting',
  'sword',
];

export const POSE_LABELS: Record<PoseName, string> = {
  standing: '站立',
  talking: '交谈',
  arms_crossed: '抱臂',
  sitting: '坐下',
  eating: '进食',
  crouching: '蹲伏',
  kneeling: '下跪',
  lying: '躺 / 倒地',
  walking: '行走',
  running: '奔跑',
  pointing: '指向',
  holding: '持物',
  interacting: '操作 / 互动',
  fighting: '格斗',
  sword: '持械',
};

export function isPoseName(value: unknown): value is PoseName {
  return typeof value === 'string' && (POSES as string[]).includes(value);
}

export function requirePoseName(value: unknown, context = 'pose'): PoseName {
  if (isPoseName(value)) return value;
  throw new Error(`Invalid 3GS actor ${context}: ${String(value)}`);
}

export function nextPose(current: PoseName, dir: 1 | -1): PoseName {
  const idx = POSES.indexOf(current);
  const base = idx < 0 ? 0 : idx;
  const next = (base + dir + POSES.length) % POSES.length;
  return POSES[next];
}
