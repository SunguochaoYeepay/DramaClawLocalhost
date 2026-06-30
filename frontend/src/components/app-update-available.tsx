// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  dismissUpdateAvailable,
  useUpdateAvailable,
} from "@/lib/app-update-available";

export function AppUpdateAvailable() {
  const { t } = useTranslation();
  const visible = useUpdateAvailable();

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-12 z-[1000] flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md rounded-md border border-white/10 bg-neutral-900/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
            <RefreshCw className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">
              {t("app.updateAvailable.title")}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-white/60">
              {t("app.updateAvailable.description")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("app.updateAvailable.dismiss")}
            onClick={dismissUpdateAvailable}
            className="shrink-0 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            size="sm"
            onClick={() => window.location.reload()}
          >
            {t("app.updateAvailable.refresh")}
          </Button>
        </div>
      </div>
    </div>
  );
}
