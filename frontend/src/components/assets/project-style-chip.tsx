// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useProject } from "@/lib/queries/projects";
import { useStyles } from "@/lib/queries/styles";
import { cn } from "@/lib/utils";
import type { Style } from "@/types/style";

export type ProjectStyleChipProps = {
  project: string;
  className?: string;
};

const DEFAULT_VISUAL_STYLE = "chinese_period_drama";

const BUILTIN_STYLE_LABEL_KEYS: Record<string, string> = {
  chinese_period_drama: "ingest.visualStyles.chinesePeriodDrama",
  anime: "ingest.visualStyles.anime",
  guoman_fantasy: "ingest.visualStyles.guomanFantasy",
  post_apocalyptic: "ingest.visualStyles.postApocalyptic",
  realistic: "ingest.visualStyles.realistic",
  republican_era_drama: "ingest.visualStyles.republicanEraDrama",
};

function resolveStyleLabel(
  styleId: string,
  styles: Style[],
  t: (key: string) => string,
): string {
  const record = styles.find((style) => style.id === styleId);
  if (record) return record.label || record.name || styleId;

  const fallbackKey = BUILTIN_STYLE_LABEL_KEYS[styleId];
  return fallbackKey ? t(fallbackKey) : styleId;
}

export function ProjectStyleChip({ project, className }: ProjectStyleChipProps) {
  const { t } = useTranslation();
  const projectQuery = useProject(project);
  const stylesQuery = useStyles(project);
  const styleId =
    projectQuery.data?.data.visual_style?.trim() || DEFAULT_VISUAL_STYLE;
  const styles = stylesQuery.data?.data ?? [];
  const loading =
    projectQuery.isLoading || (stylesQuery.isLoading && !stylesQuery.data);
  const label = useMemo(
    () => resolveStyleLabel(styleId, styles, t),
    [styleId, styles, t],
  );
  const displayLabel = loading ? t("characters.projectStyle.loading") : label;
  const text = displayLabel;

  return (
    <span
      aria-label={text}
      title={t("characters.projectStyle.configureHint")}
      className={cn(
        "rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
}
