// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { Film } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * Compact "used in N beats" indicator for asset cards. Renders nothing when the
 * asset isn't referenced anywhere (keeps grids quiet). Count is supplied by the
 * caller via `useAssetReferenceIndex` so the heavy beat scan happens once per
 * panel, not once per card.
 */
export function UsageCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[6px] border border-border bg-background/40 px-1.5 py-0.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <Film className="size-3" />
      {t("assets.common.usageCount", { count })}
    </span>
  );
}
