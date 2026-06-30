// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import {
  CREDIT_VALUE_CLASS,
  CreditSparkIcon,
  useCreditDisplayHidden,
} from "@/components/credits/credit-visual";
import { isCeRuntime } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";

export function CreditCostInline({ display }: { display?: string | null }) {
  if (useCreditDisplayHidden()) return null;
  if (isCeRuntime()) return null;
  if (!display) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none ml-1 inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium",
        CREDIT_VALUE_CLASS,
      )}
    >
      <CreditSparkIcon className="size-3" />
      {display}
    </span>
  );
}
