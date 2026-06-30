// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Megaphone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type NotificationTone = "update" | "notice";

interface NotificationItem {
  id: string;
  titleKey: string;
  bodyKey: string;
  timeKey: string;
  tone: NotificationTone;
}

const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "feature-rewards",
    titleKey: "notifications.items.featureRewards.title",
    bodyKey: "notifications.items.featureRewards.body",
    timeKey: "notifications.items.featureRewards.time",
    tone: "update",
  },
  {
    id: "version-dialog",
    titleKey: "notifications.items.versionDialog.title",
    bodyKey: "notifications.items.versionDialog.body",
    timeKey: "notifications.items.versionDialog.time",
    tone: "update",
  },
  {
    id: "piko-position",
    titleKey: "notifications.items.pikoPosition.title",
    bodyKey: "notifications.items.pikoPosition.body",
    timeKey: "notifications.items.pikoPosition.time",
    tone: "notice",
  },
  {
    id: "header-update",
    titleKey: "notifications.items.headerUpdate.title",
    bodyKey: "notifications.items.headerUpdate.body",
    timeKey: "notifications.items.headerUpdate.time",
    tone: "notice",
  },
  {
    id: "batch-reward",
    titleKey: "notifications.items.batchReward.title",
    bodyKey: "notifications.items.batchReward.body",
    timeKey: "notifications.items.batchReward.time",
    tone: "update",
  },
];

const DRAWER_TRANSITION_MS = 260;

export function NotificationDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(false);
      setShouldRender(true);
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame) window.cancelAnimationFrame(secondFrame);
      };
    }

    setVisible(false);
    const timer = window.setTimeout(() => setShouldRender(false), DRAWER_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!shouldRender) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, shouldRender]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label={t("notifications.close")}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[260ms] ease-[var(--ease-out-quint)] ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => onOpenChange(false)}
      />
      <aside
        aria-label={t("notifications.title")}
        className={`absolute right-0 top-0 flex h-full w-[390px] max-w-[calc(100vw-20px)] flex-col border-l border-white/[0.08] bg-[#111113]/92 text-slate-100 shadow-[-24px_0_60px_rgba(0,0,0,0.34)] backdrop-blur-md transition-transform duration-[260ms] ease-[var(--ease-out-quint)] will-change-transform ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex h-[54px] shrink-0 items-end justify-between px-5 pb-1.5">
          <h2 className="text-[20px] font-semibold tracking-normal text-white">
            {t("notifications.title")}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-full text-slate-300 hover:bg-white/[0.06] hover:text-white"
            aria-label={t("notifications.close")}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3 pl-2 pr-4 pt-1">
          <div className="space-y-1">
            {NOTIFICATIONS.map((item) => (
              <NotificationRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const { t } = useTranslation();
  const Icon = item.tone === "update" ? Sparkles : Megaphone;

  return (
    <article className="group grid grid-cols-[38px_minmax(0,1fr)] gap-3 rounded-[12px] px-2 py-3 transition-colors duration-150 hover:bg-white/[0.045]">
      <div className="flex size-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-cyan-200/90">
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-[14px] font-medium leading-5 text-slate-50">
          {t(item.titleKey)}
        </h3>
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-400">
          {t(item.bodyKey)}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">
          {t(item.timeKey)}
        </p>
      </div>
    </article>
  );
}
