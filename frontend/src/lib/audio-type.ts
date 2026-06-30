// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
const LABELS: Record<string, string> = {
  narration: "旁白",
  dialogue: "对白",
};

export function audioTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return LABELS[type] ?? type;
}
