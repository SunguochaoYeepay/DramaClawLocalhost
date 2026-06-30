// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
export const TIME_OF_DAY_NONE_LABEL = "无（保持场景图光线，不重打光）";

export const STANDARD_TIME_OF_DAY_OPTIONS = [
  "清晨",
  "上午",
  "正午",
  "午后",
  "白天",
  "黄昏",
  "夜晚",
] as const;

const STANDARD_TIME_OF_DAY_SET = new Set<string>(STANDARD_TIME_OF_DAY_OPTIONS);

export function timeOfDayOptions(...values: Array<string | null | undefined>): string[] {
  const options: string[] = [...STANDARD_TIME_OF_DAY_OPTIONS];
  const seen = new Set<string>(options);
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    options.push(trimmed);
  }
  return options;
}

export function timeOfDayLabel(value: string | null | undefined): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return TIME_OF_DAY_NONE_LABEL;
  return STANDARD_TIME_OF_DAY_SET.has(trimmed) ? trimmed : `${trimmed}（剧本原值）`;
}
