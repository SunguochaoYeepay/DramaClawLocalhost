// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { subscribeOpenVersionUpdateDialog } from "@/features/version-update/version-update-events";

const UPDATE_ITEM_KEYS = [
  "app.versionUpdate.items.0",
  "app.versionUpdate.items.1",
  "app.versionUpdate.items.2",
  "app.versionUpdate.items.3",
  "app.versionUpdate.items.4",
] as const;

export function VersionUpdateDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeOpenVersionUpdateDialog(() => setOpen(true)), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/56 backdrop-blur-md supports-backdrop-filter:backdrop-blur-md"
        className="max-h-[min(84dvh,560px)] w-[min(calc(100vw-32px),400px)] gap-0 overflow-hidden rounded-[14px] border-0 bg-white p-0 text-slate-950 shadow-[0_16px_48px_rgba(0,0,0,0.26)] ring-0 sm:max-w-[400px]"
      >
        <div className="p-2">
          <div className="relative flex aspect-[2/1] overflow-hidden rounded-[12px] bg-[#b9e7ff]">
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src="/video/version-update-2026-06-22.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-white/[0.02]" />
          </div>
        </div>

        <div className="px-4.5 pb-5 pt-3.5 sm:px-5">
          <DialogTitle className="text-[17px] font-medium leading-tight tracking-normal text-slate-950 sm:text-[18px]">
            {t("app.versionUpdate.title")}
          </DialogTitle>
          <div className="mt-4 max-h-[138px] space-y-4 overflow-y-auto pr-2 text-[12.5px] leading-6 text-slate-700 [scrollbar-gutter:stable] sm:text-[13.5px]">
            {UPDATE_ITEM_KEYS.map((key, index) => (
              <p key={key} className="m-0">
                {index + 1}. {t(key)}
              </p>
            ))}
          </div>
          <Button
            type="button"
            className="mt-7 h-10 w-full rounded-[8px] bg-neutral-950 text-[14px] font-medium text-white shadow-none transition-[background,box-shadow,filter] duration-200 ease-out hover:bg-[#171717] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_7px_18px_rgba(0,0,0,0.16)] hover:brightness-110 active:bg-neutral-950 active:shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]"
            onClick={() => setOpen(false)}
          >
            {t("app.versionUpdate.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
