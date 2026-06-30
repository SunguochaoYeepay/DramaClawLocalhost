// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useTranslation } from "react-i18next";

import { CREDIT_VALUE_CLASS, CreditSparkIcon } from "@/components/credits/credit-visual";
import { useCurrentUser } from "@/lib/queries/auth";
import { isCeRuntime } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

function formatCredits(value: number, language: string): string {
  return new Intl.NumberFormat(language, {
    compactDisplay: "short",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
    notation: "compact",
  }).format(value);
}

function formatFullCredits(value: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
}

export function CreditBalanceBadge() {
  // Hooks must run unconditionally (Rules of Hooks); gate the CE/auth checks
  // after them. `useCurrentUser` stays disabled in CE so we don't fetch there.
  const ce = isCeRuntime();
  const { t, i18n } = useTranslation();
  const username = useAuthStore((s) => s.username);
  const { data, isLoading, isError } = useCurrentUser(Boolean(username) && !ce);
  const balance = data?.data.credit_balance;
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? "en";

  if (ce || !username || isError) return null;

  return (
    <div
      className="group/credits ml-1 flex h-9 min-w-0 items-center gap-1 px-0.5 text-sm font-medium text-muted-foreground"
      title={
        balance === undefined
          ? t("credits.balance")
          : `${t("credits.balance")}: ${formatFullCredits(balance, language)}`
      }
      aria-label={t("credits.balance")}
    >
      <span className="flex shrink-0 items-center">
        <CreditSparkIcon className="size-[17px]" withHoverMotion />
      </span>
      <span className={cn("max-w-20 truncate text-[12px] leading-none", CREDIT_VALUE_CLASS)}>
        {isLoading || balance === undefined ? "--" : formatCredits(balance, language)}
      </span>
    </div>
  );
}
