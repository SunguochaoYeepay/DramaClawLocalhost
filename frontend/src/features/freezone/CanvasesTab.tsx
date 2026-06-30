// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  Film,
  Frame,
  Home,
  RotateCcw,
  SquareDashed,
  Trash2,
  UserRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  createBlankFreezoneCanvas,
  deleteFreezoneCanvas,
  type FreezoneCanvasSummary,
} from "@/api/canvas";
import { ApiError } from "@/api/client";
import { writeUrl } from "@/lib/url-params";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/auth-store";
import { personalCanvasIdForUsername } from "@/features/freezone/projections";
import { useFreezoneCanvases } from "@/lib/queries/freezone";
import { BackendStatusError } from "@/lib/api-errors";

const PERSONAL_CANVAS_DISPLAY_NAME = "__personal_canvas__";

interface CanvasesTabProps {
  project: string;
  currentCanvasId: string;
  /**
   * Refresh the current preset/mainline canvas in place. The shell exposes
   * this via `useCanvasSync.restoreMainlineDefault`; we only show the button
   * when the current canvas is a preset/mainline canvas (`hasPresetLabel`).
   */
  onRestoreMainlineDefault?: () => Promise<void> | void;
  hasPresetLabel: boolean;
  reloadToken?: number;
}

export function CanvasesTab({
  project,
  currentCanvasId,
  onRestoreMainlineDefault,
  hasPresetLabel,
  reloadToken,
}: CanvasesTabProps) {
  const { t } = useTranslation();
  const username = useAuthStore((state) => state.username);
  const canvasesQuery = useFreezoneCanvases(project);
  const [deletedCanvasIds, setDeletedCanvasIds] = useState<Set<string>>(() => new Set());
  const items = (canvasesQuery.data ?? []).filter((item) => !deletedCanvasIds.has(item.id));
  const loading = canvasesQuery.isLoading;
  const queryError = canvasesQuery.error;
  const [localError, setLocalError] = useState<string | null>(null);
  const [deletingCanvasId, setDeletingCanvasId] = useState<string | null>(null);
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [newCanvasName, setNewCanvasName] = useState("");
  const [restoringMainline, setRestoringMainline] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState(false);
  const [expandedOther, setExpandedOther] = useState(false);
  const reloadKey = `${reloadToken ?? 0}`;
  const previousReloadKeyRef = useRef(reloadKey);

  useEffect(() => {
    if (previousReloadKeyRef.current === reloadKey) return;
    previousReloadKeyRef.current = reloadKey;
    void canvasesQuery.refetch();
  }, [canvasesQuery, reloadKey]);

  const error = localError ?? (queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null);

  const switchTo = (id: string) => {
    if (id === currentCanvasId) return;
    writeUrl({ canvas: id });
  };

  const handleRestoreMainline = async () => {
    if (!onRestoreMainlineDefault) return;
    const ok = window.confirm(t("freezone.canvases.restoreConfirm"));
    if (!ok) return;
    setRestoringMainline(true);
    try {
      await onRestoreMainlineDefault();
    } finally {
      setRestoringMainline(false);
    }
  };

  const sections = buildCanvasBrowserSections(items, currentCanvasId, username);
  const currentCanvasInMembers = sections.memberCanvases.some((item) => item.id === currentCanvasId);
  const currentCanvasInOther = sections.otherCanvases.some((item) => item.id === currentCanvasId);
  const showRestoreMainlineAction = currentCanvasId !== "default" && hasPresetLabel;

  useEffect(() => {
    if (currentCanvasInMembers) {
      setExpandedMembers(true);
    }
  }, [currentCanvasInMembers]);

  useEffect(() => {
    if (currentCanvasInOther) {
      setExpandedOther(true);
    }
  }, [currentCanvasInOther]);

  const handleRestoreMainlineClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void handleRestoreMainline();
  };

  const handleCreateCanvas = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newCanvasName.trim();
    if (!name) {
      setLocalError(t("freezone.canvases.createNameRequired"));
      return;
    }
    const duplicate = findDuplicateCanvasName(items, name, t);
    if (duplicate) {
      setLocalError(t("freezone.canvases.createDuplicate", { name }));
      return;
    }
    const canvasId = userCreatedCanvasId(name, username);
    if (items.some((item) => item.id === canvasId)) {
      setLocalError(t("freezone.canvases.createDuplicate", { name }));
      return;
    }
    setCreatingCanvas(true);
    setLocalError(null);
    try {
      await createBlankFreezoneCanvas(project, {
        canvasId,
        name,
        creatorUsername: username,
      });
      setDeletedCanvasIds((prev) => {
        if (!prev.has(canvasId)) return prev;
        const next = new Set(prev);
        next.delete(canvasId);
        return next;
      });
      setNewCanvasName("");
      await canvasesQuery.refetch();
      writeUrl({ canvas: canvasId });
    } catch (err) {
      if (isConflictError(err)) {
        setLocalError(t("freezone.canvases.createDuplicate", { name }));
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setLocalError(t("freezone.canvases.createFailed", { message }));
    } finally {
      setCreatingCanvas(false);
    }
  };

  const handleDeleteCanvas = async (item: CanvasDisplaySummary) => {
    if (!canDeleteCanvasSummary(item, username)) return;
    const name = displayNameForCanvasSummary(item, t);
    const ok = window.confirm(t("freezone.canvases.deleteConfirm", { name }));
    if (!ok) return;
    setDeletingCanvasId(item.id);
    setLocalError(null);
    try {
      await deleteFreezoneCanvas(project, item.id);
      setDeletedCanvasIds((prev) => new Set(prev).add(item.id));
      await canvasesQuery.refetch();
      if (item.id === currentCanvasId) {
        writeUrl({ canvas: username ? personalCanvasIdForUsername(username) : "default" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocalError(t("freezone.canvases.deleteFailed", { message }));
    } finally {
      setDeletingCanvasId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error && (
        <div className="px-3 pb-2 pt-3">
          <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
            {error}
          </div>
        </div>
      )}

      <div className="ui-scrollbar-hidden flex-1 min-h-0 overflow-y-auto px-3 pt-1 space-y-0">
        <form onSubmit={handleCreateCanvas} className="pb-2 pt-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
            <input
              value={newCanvasName}
              onChange={(event) => {
                setNewCanvasName(event.target.value);
                if (localError) setLocalError(null);
              }}
              maxLength={40}
              placeholder={t("freezone.canvases.createPlaceholder")}
              disabled={creatingCanvas}
              className="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs text-white/82 outline-none placeholder:text-white/34 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={creatingCanvas || !newCanvasName.trim()}
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.045] px-2.5 text-[11px] font-medium text-white/72 transition hover:border-white/18 hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              title={t("freezone.canvases.createTitle")}
            >
              {creatingCanvas ? t("freezone.canvases.createBusy") : t("freezone.canvases.create")}
            </button>
          </div>
        </form>
        {loading ? (
          <div className="py-8 text-center text-xs text-text-muted">
            {t("freezone.canvases.loading")}
          </div>
        ) : (
          <>
            <CanvasSectionTitle label={t("freezone.canvases.myCanvasSection")} />
            <CanvasListItem
              item={sections.defaultCanvas}
              currentCanvasId={currentCanvasId}
              showRestoreMainlineAction={showRestoreMainlineAction && sections.defaultCanvas.id === currentCanvasId}
              restoringMainline={restoringMainline}
              onSwitch={switchTo}
              onRestoreMainline={handleRestoreMainlineClick}
              canDelete={canDeleteCanvasSummary(sections.defaultCanvas, username)}
              deleting={deletingCanvasId === sections.defaultCanvas.id}
              onDelete={handleDeleteCanvas}
            />

            {sections.memberCanvases.length > 0 && (
              <CollapsibleCanvasSection
                title={t("freezone.canvases.memberCanvasesSection")}
                count={sections.memberCanvases.length}
                expanded={expandedMembers}
                onToggle={() => setExpandedMembers((value) => !value)}
                expandTitle={t("freezone.canvases.expandMemberCanvases")}
                collapseTitle={t("freezone.canvases.collapseMemberCanvases")}
              >
                {sections.memberCanvases.map((item) => (
                  <CanvasListItem
                    key={`member:${item.id}`}
                    item={item}
                    currentCanvasId={currentCanvasId}
                    showRestoreMainlineAction={showRestoreMainlineAction && item.id === currentCanvasId}
                    restoringMainline={restoringMainline}
                    onSwitch={switchTo}
                    onRestoreMainline={handleRestoreMainlineClick}
                    canDelete={canDeleteCanvasSummary(item, username)}
                    deleting={deletingCanvasId === item.id}
                    onDelete={handleDeleteCanvas}
                  />
                ))}
              </CollapsibleCanvasSection>
            )}

            {sections.otherCanvases.length > 0 && (
              <CollapsibleCanvasSection
                title={t("freezone.canvases.otherCanvasesSection")}
                count={sections.otherCanvases.length}
                expanded={expandedOther}
                onToggle={() => setExpandedOther((value) => !value)}
                expandTitle={t("freezone.canvases.expandOtherCanvases")}
                collapseTitle={t("freezone.canvases.collapseOtherCanvases")}
              >
                {sections.otherCanvases.map((item) => (
                  <CanvasListItem
                    key={`other:${item.id}`}
                    item={item}
                    currentCanvasId={currentCanvasId}
                    showRestoreMainlineAction={showRestoreMainlineAction && item.id === currentCanvasId}
                    restoringMainline={restoringMainline}
                    onSwitch={switchTo}
                    onRestoreMainline={handleRestoreMainlineClick}
                    canDelete={canDeleteCanvasSummary(item, username)}
                    deleting={deletingCanvasId === item.id}
                    onDelete={handleDeleteCanvas}
                  />
                ))}
              </CollapsibleCanvasSection>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CanvasSectionTitle({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`pb-2 pt-4 text-xs font-semibold text-white/72 ${className ?? ""}`}>
      {label}
    </div>
  );
}

function CollapsibleCanvasSection({
  title,
  count,
  expanded,
  onToggle,
  expandTitle,
  collapseTitle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  expandTitle: string;
  collapseTitle: string;
  children: ReactNode;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-2 text-left text-xs font-semibold text-white/72 hover:text-white"
        aria-expanded={expanded}
        title={expanded ? collapseTitle : expandTitle}
      >
        <span>{title}</span>
        <span className="inline-flex items-center gap-2 text-[11px] text-white/40">
          {count}
          <Icon className="h-3.5 w-3.5" />
        </span>
      </button>
      {expanded && <div className="space-y-2 pb-1 pt-1">{children}</div>}
    </div>
  );
}

function CanvasListItem({
  item,
  currentCanvasId,
  showRestoreMainlineAction,
  restoringMainline,
  onSwitch,
  onRestoreMainline,
  canDelete,
  deleting,
  onDelete,
}: {
  item: CanvasDisplaySummary;
  currentCanvasId: string;
  showRestoreMainlineAction: boolean;
  restoringMainline: boolean;
  onSwitch: (id: string) => void;
  onRestoreMainline: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  canDelete: boolean;
  deleting: boolean;
  onDelete: (item: CanvasDisplaySummary) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const isCurrent = item.id === currentCanvasId;
  const sourceCanvasId = sourceCanvasIdFromSummary(item);
  const summary =
    item.displayKind === "personal" && item.displayName === PERSONAL_CANVAS_DISPLAY_NAME
      ? t("freezone.canvases.personalCanvasName")
      : displayNameForCanvasSummary(item, t);
  const kind = canvasKindFromSummary(item);
  const Icon = isConflictCopyCanvas(item) ? Copy : CANVAS_KIND_ICON[kind] ?? Frame;
  const relative = formatRelative(item.modified_at, t);
  const canRestoreMainline = isCurrent && showRestoreMainlineAction;

  return (
    <div
      className={
        "group relative flex items-center gap-3 rounded-lg py-2 transition " +
        (isCurrent ? "cursor-default" : "cursor-pointer opacity-60 hover:opacity-90")
      }
      aria-current={isCurrent ? "true" : undefined}
      title={`${item.id} · ${relative} · ${(item.size / 1024).toFixed(1)} KB`}
    >
      <div className="flex w-full min-w-0 items-center gap-4">
        <button
          type="button"
          onClick={() => onSwitch(item.id)}
          disabled={isCurrent}
          className="block shrink-0 disabled:cursor-default"
        >
          <div
            className={
              "relative flex h-[80px] w-[60px] items-center justify-center overflow-hidden rounded-[6px] border " +
              (isCurrent
                ? "border-primary/30 bg-primary/[0.12]"
                : "border-white/[0.08] bg-white/[0.04]")
            }
          >
            <Icon className={"h-5 w-5 " + (isCurrent ? "text-primary" : "text-white/50")} />
          </div>
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onSwitch(item.id)}
            disabled={isCurrent}
            className="block max-w-full text-left disabled:cursor-default"
          >
            <span
              className={
                "block max-w-full truncate text-sm font-medium " +
                (isCurrent ? "text-white" : "text-white/60")
              }
            >
              {summary}
            </span>
            {relative ? (
              <span className={`mt-2 block truncate text-[11px] leading-snug tabular-nums ${isCurrent ? "text-white/55" : "text-white/40"}`}>
                {relative}
              </span>
            ) : null}
          </button>
        {canRestoreMainline || canDelete ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canRestoreMainline && (
              <button
                type="button"
                onClick={onRestoreMainline}
                disabled={restoringMainline}
                className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 text-[10px] font-medium text-white/72 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white disabled:cursor-default disabled:opacity-50"
                title={t("freezone.canvases.restoreTitle")}
              >
                <RotateCcw className="h-3 w-3" />
                {restoringMainline ? t("freezone.canvases.restoreBusy") : t("freezone.canvases.restore")}
              </button>
            )}
            {canDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onDelete(item);
              }}
              disabled={deleting}
              className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-red-400/20 bg-red-500/[0.04] px-2 text-[10px] font-medium text-red-200/80 transition hover:border-red-300/35 hover:bg-red-500/[0.08] hover:text-red-100 disabled:opacity-50"
              title={t("freezone.canvases.deleteTitle")}
            >
              <Trash2 className="h-3 w-3" />
              {deleting ? t("freezone.canvases.deleteBusy") : t("freezone.canvases.delete")}
            </button>
            )}
          </div>
        ) : null}
        </div>
      </div>
      {sourceCanvasId && sourceCanvasId !== currentCanvasId && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSwitch(sourceCanvasId);
          }}
          title={t("freezone.canvases.sourceCanvasTitle", { canvasId: sourceCanvasId })}
          className="tap-button h-6 px-2 text-[10px] border-amber-300/35 text-amber-200 hover:bg-amber-300/15 hover:text-amber-100"
        >
          {t("freezone.canvases.sourceCanvas")}
        </button>
      )}
    </div>
  );
}

type CanvasDisplaySummary = FreezoneCanvasSummary & {
  displayName?: string;
  displayKind?: CanvasKind;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface CanvasBrowserSections {
  defaultCanvas: CanvasDisplaySummary;
  memberCanvases: CanvasDisplaySummary[];
  otherCanvases: CanvasDisplaySummary[];
}

export function buildCanvasBrowserSections(
  items: FreezoneCanvasSummary[],
  _currentCanvasId: string,
  username?: string | null,
): CanvasBrowserSections {
  const personalCanvasId = username ? personalCanvasIdForUsername(username) : null;
  const existingPersonal = personalCanvasId
    ? items.find((item) => item.id === personalCanvasId)
    : undefined;
  const defaultCanvas: CanvasDisplaySummary =
    username && personalCanvasId
      ? {
          ...(existingPersonal ?? { id: personalCanvasId, modified_at: "", size: 0 }),
          displayName: username,
          displayKind: "personal",
        }
      : items.find((it) => canvasKindFromSummary(it) === "default") ?? {
          id: "default",
          modified_at: "",
          size: 0,
        };
  const visibleItems = items.filter((item) => item.id !== defaultCanvas.id);
  const memberCanvases: CanvasDisplaySummary[] = [];
  const otherCanvases: CanvasDisplaySummary[] = [];

  for (const item of visibleItems) {
    if (isPersonalCanvasForAnyUser(item)) {
      memberCanvases.push({ ...item, displayKind: "personal" });
      continue;
    }
    if (isUserCreatedCanvas(item)) {
      memberCanvases.push(item);
      continue;
    }
    otherCanvases.push(item);
  }

  return {
    defaultCanvas,
    memberCanvases: memberCanvases.sort(compareCanvasSummaryByRecent),
    otherCanvases: otherCanvases.sort(compareCanvasSummaryByRecent),
  };
}

export function orderCanvasSummaries(
  items: FreezoneCanvasSummary[],
  currentCanvasId: string,
): FreezoneCanvasSummary[] {
  const sections = buildCanvasBrowserSections(items, currentCanvasId);
  return [
    sections.defaultCanvas,
    ...sections.memberCanvases,
    ...sections.otherCanvases,
  ].filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index);
}

export function isEpisodeSectionExpandedByDefault({
  episode,
  currentEpisode,
}: {
  episode: number;
  currentEpisode: number | null;
}): boolean {
  return currentEpisode !== null && episode === currentEpisode;
}

function compareCanvasSummaryByRecent(a: FreezoneCanvasSummary, b: FreezoneCanvasSummary): number {
  return timestampOf(b.modified_at) - timestampOf(a.modified_at) || a.id.localeCompare(b.id);
}

function isPersonalCanvasForAnyUser(item: FreezoneCanvasSummary): boolean {
  if (isConflictCopyCanvas(item)) return false;
  return /^user_[a-z0-9_-]+_[a-z0-9]+$/.test(item.id);
}

function isConflictCopyCanvas(item: FreezoneCanvasSummary): boolean {
  return item.metadata?.canvas_origin === "conflict_copy" || item.id.startsWith("copy_") || item.id.includes("_copy_");
}

function isUserCreatedCanvas(item: FreezoneCanvasSummary): boolean {
  return item.metadata?.canvas_origin === "user_created";
}

function isConflictError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.status === 409) ||
    (error instanceof BackendStatusError && error.status === 409)
  );
}

export function canDeleteCanvasSummary(
  item: FreezoneCanvasSummary,
  username?: string | null,
): boolean {
  const personalCanvasId = username ? personalCanvasIdForUsername(username) : null;
  if (personalCanvasId && item.id === personalCanvasId) return false;
  if (isPersonalCanvasForAnyUser(item)) return false;
  return true;
}

function timestampOf(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
}

type CanvasKind =
  | "default"
  | "episode"
  | "beat"
  | "personal"
  | "asset"
  | "workflow"
  | "blank"
  | "other";

const CANVAS_KIND_ICON: Record<CanvasKind, LucideIcon> = {
  default: Home,
  episode: Film,
  beat: Frame,
  personal: UserRound,
  asset: Box,
  workflow: Workflow,
  blank: SquareDashed,
  other: Frame,
};

export function canvasKindFromSummary(item: FreezoneCanvasSummary): CanvasKind {
  const displayKind = (item as CanvasDisplaySummary).displayKind;
  if (displayKind) return displayKind;
  if (isUserCreatedCanvas(item)) return "blank";
  const metadata = item.metadata ?? {};
  if (metadata.free_workflow && typeof metadata.free_workflow === "object") {
    return "workflow";
  }
  const preset = metadata.preset as { scope?: unknown } | undefined;
  const scope =
    typeof item.canvas_scope === "string"
      ? item.canvas_scope
      : typeof preset?.scope === "string"
        ? preset.scope
        : item.id === "default"
          ? "default"
          : "";
  if (scope === "default") return "default";
  if (scope === "episode") return "episode";
  if (scope === "beat") return "beat";
  if (scope === "asset") return "asset";
  if (scope === "blank") return "blank";
  return "other";
}

function sourceCanvasIdFromSummary(item: FreezoneCanvasSummary): string | null {
  const freeWorkflow = item.metadata?.free_workflow;
  if (!freeWorkflow || typeof freeWorkflow !== "object") return null;
  const sourceCanvasId = (freeWorkflow as { source_canvas_id?: unknown }).source_canvas_id;
  return typeof sourceCanvasId === "string" && sourceCanvasId.trim().length > 0
    ? sourceCanvasId
    : null;
}

function metadataString(item: FreezoneCanvasSummary, key: string): string | null {
  const value = item.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function rawDisplayNameFromSummary(item: FreezoneCanvasSummary): string | null {
  return metadataString(item, "display_name");
}

function creatorUsernameFromSummary(item: FreezoneCanvasSummary): string | null {
  return metadataString(item, "creator_username");
}

function displayNameForCanvasSummary(item: CanvasDisplaySummary, t: Translate): string {
  const rawDisplayName = rawDisplayNameFromSummary(item);
  if (rawDisplayName) {
    const creator = creatorUsernameFromSummary(item);
    return creator ? t("freezone.canvases.userCreatedName", { user: creator, name: rawDisplayName }) : rawDisplayName;
  }
  return item.displayName ?? describeCanvasSummary(item, t);
}

function normalizeCanvasName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function compareCanvasName(item: FreezoneCanvasSummary, name: string, t: Translate): boolean {
  const normalized = normalizeCanvasName(name);
  if (!normalized) return false;
  const rawDisplayName = rawDisplayNameFromSummary(item);
  if (rawDisplayName && normalizeCanvasName(rawDisplayName) === normalized) return true;
  return normalizeCanvasName(describeCanvasSummary(item, t)) === normalized;
}

export function findDuplicateCanvasName(
  items: FreezoneCanvasSummary[],
  name: string,
  t: Translate,
): FreezoneCanvasSummary | null {
  return items.find((item) => compareCanvasName(item, name, t)) ?? null;
}

export function userCreatedCanvasId(name: string, username?: string | null): string {
  const base = `${username?.trim() || "user"}:${name.trim()}`;
  const slug = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "canvas";
  return `canvas_${slug}_${stableCanvasIdHash(base)}`.slice(0, 64).replace(/_+$/g, "");
}

function stableCanvasIdHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function describeCanvasSummary(item: FreezoneCanvasSummary, t: Translate): string {
  const metadata = item.metadata ?? {};
  if (isConflictCopyCanvas(item)) return t("freezone.canvases.conflictCopy");
  if (metadata.free_workflow && typeof metadata.free_workflow === "object") {
    const source = (metadata.free_workflow as { source_preset?: unknown }).source_preset as
      | { scope?: unknown; episode?: unknown; beat?: unknown; asset_kind?: unknown; asset_id?: unknown }
      | null
      | undefined;
    if (source?.scope === "beat") {
      return t("freezone.canvases.description.freeWorkflowBeat", {
        episode: source.episode ?? "?",
        beat: source.beat ?? "?",
      });
    }
    if (source?.scope === "asset") {
      return t("freezone.canvases.description.freeWorkflowAsset", {
        asset: source.asset_id ?? source.asset_kind ?? t("freezone.canvases.description.assetFallback"),
      });
    }
    return t("freezone.canvases.description.freeWorkflow");
  }
  const preset = metadata.preset as
    | {
        scope?: unknown;
        episode?: unknown;
        beat?: unknown;
        primary_slot?: unknown;
        asset_kind?: unknown;
        character?: unknown;
        identity_id?: unknown;
        asset_id?: unknown;
      }
    | undefined;
  const scope =
    typeof item.canvas_scope === "string"
      ? item.canvas_scope
      : typeof preset?.scope === "string"
        ? preset.scope
        : item.id === "default"
          ? "default"
          : "";

  if (scope === "default") return t("freezone.canvases.description.default");
  if (scope === "episode") {
    const episode =
      typeof item.episode === "number"
        ? item.episode
        : typeof preset?.episode === "number"
          ? preset.episode
          : null;
    return episode !== null
      ? t("freezone.canvases.description.episode", { episode })
      : t("freezone.canvases.description.episodeUnknown");
  }
  if (scope === "beat") {
    const episode =
      typeof item.episode === "number"
        ? item.episode
        : typeof preset?.episode === "number"
          ? preset.episode
          : null;
    const beat =
      typeof item.beat === "number"
        ? item.beat
        : typeof preset?.beat === "number"
          ? preset.beat
          : null;
    const slot = typeof preset?.primary_slot === "string" ? ` · ${preset.primary_slot}` : "";
    return t("freezone.canvases.description.beat", {
      episode: episode ?? "?",
      beat: beat ?? "?",
      slot,
    });
  }
  if (scope === "asset") {
    const kind =
      typeof preset?.asset_kind === "string"
        ? preset.asset_kind
        : t("freezone.canvases.description.assetFallback");
    const character = typeof preset?.character === "string" ? preset.character : "";
    const identityId = typeof preset?.identity_id === "string" ? preset.identity_id : "";
    const assetId = typeof preset?.asset_id === "string" ? preset.asset_id : "";
    const name = character || identityId || assetId;
    return name
      ? t("freezone.canvases.description.asset", { name, kind })
      : t("freezone.canvases.description.assetUnknown", { kind });
  }
  if (scope === "blank") return t("freezone.canvases.description.blank");
  return item.id;
}

function formatRelative(iso: string, t: Translate): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return iso;
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("freezone.canvases.relative.now");
  if (minutes < 60) return t("freezone.canvases.relative.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("freezone.canvases.relative.hours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("freezone.canvases.relative.days", { count: days });
  return iso.slice(0, 10);
}
