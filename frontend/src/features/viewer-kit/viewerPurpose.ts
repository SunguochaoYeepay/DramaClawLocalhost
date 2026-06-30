// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
export type ViewerPurpose = "mainline" | "freezone" | "asset" | "beat";

export function viewerPurposeLabel(purpose: ViewerPurpose | undefined): string {
  if (purpose === "freezone") return "自由世界";
  if (purpose === "asset") return "主线资产取景";
  if (purpose === "beat") return "主线 Beat 制作";
  return "主线 pipeline";
}
