// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useMemo } from "react";
import {
  Fingerprint,
  Image,
  Star,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Character } from "@/types/character";

export type CharacterStats = {
  total: number;
  withPortraits: number;
  mainCharacters: number;
  identityReady: number;
  voiceReady: number;
};

export type CharacterStatsStripProps = {
  characters: Character[];
  identityCounts?: Record<string, number>;
  mainCharacterLabel?: string;
  className?: string;
};

type DisplayStatItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  display: string;
  tone?: "default" | "ready" | "warning";
};

function hasValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function deriveCharacterStats(
  characters: Character[],
  identityCounts?: Record<string, number>,
): CharacterStats {
  const stats: CharacterStats = {
    total: characters.length,
    withPortraits: 0,
    mainCharacters: 0,
    identityReady: 0,
    voiceReady: 0,
  };

  for (const character of characters) {
    if (hasValue(character.portrait_path) || hasValue(character.portrait_url)) {
      stats.withPortraits += 1;
    }
    if (character.is_main === true) {
      stats.mainCharacters += 1;
    }
    if (hasValue(character.reference_audio_path)) {
      stats.voiceReady += 1;
    }
    if ((identityCounts?.[character.name] ?? 0) > 0) {
      stats.identityReady += 1;
    }
  }

  return stats;
}

export function CharacterStatsStrip({
  characters,
  identityCounts,
  mainCharacterLabel = "解说主角",
  className,
}: CharacterStatsStripProps) {
  const stats = useMemo(
    () => deriveCharacterStats(characters, identityCounts),
    [characters, identityCounts],
  );
  // 已有/全部 口径:头像、身份、声线都展示「已就绪 / 总角色」。
  const items: DisplayStatItem[] = [
    { key: "total", label: "总角色", icon: Users, display: `${stats.total}` },
    {
      key: "mainCharacters",
      label: mainCharacterLabel,
      icon: Star,
      display: `${stats.mainCharacters}`,
    },
    {
      key: "withPortraits",
      label: "头像",
      icon: Image,
      display: `${stats.withPortraits}/${stats.total}`,
      tone: "ready",
    },
    {
      key: "identityReady",
      label: "身份",
      icon: Fingerprint,
      display: `${stats.identityReady}/${stats.total}`,
    },
    {
      key: "voiceReady",
      label: "声线",
      icon: Volume2,
      display: `${stats.voiceReady}/${stats.total}`,
      tone: "ready",
    },
  ];

  return (
    <ul
      aria-label="角色统计"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-10 gap-y-2 py-1.5",
        className,
      )}
    >
      {items.map(({ key, label, icon: Icon, display, tone = "default" }) => (
        <li
          key={key}
          aria-label={`${label}: ${display}`}
          className="flex items-center gap-2"
        >
          <Icon
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              tone === "ready" && "text-emerald-600 dark:text-emerald-300",
              tone === "warning" && "text-amber-600 dark:text-amber-300",
            )}
          />
          <div className="flex items-center gap-5">
            <span className="truncate text-[11px] text-muted-foreground">
              {label}
            </span>
            <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
              {display}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
