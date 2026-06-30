// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Trash2, Upload, X } from 'lucide-react';

import {
  deleteFreezoneVideoCharacterLibraryItem,
  fetchFreezoneVideoCharacterLibrary,
  submitFreezoneAddVideoCharacterLibraryItem,
  uploadFreezoneImage,
} from '@/api/ops';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import { UiButton } from '@/components/ui';

const CHARACTER_LIBRARY_MODAL_CLASS =
  'relative flex h-[min(720px,82vh)] w-[min(1120px,92vw)] flex-col overflow-hidden rounded-[10px] border border-white/[0.12] bg-[#15161b]/96 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-md';
const CHARACTER_LIBRARY_CARD_CLASS =
  'overflow-hidden rounded-[12px] border border-white/[0.10] bg-white/[0.04] transition-colors';
const CHARACTER_LIBRARY_CARD_HOVER_CLASS =
  'hover:border-white/[0.18] hover:bg-white/[0.06]';
const CHARACTER_LIBRARY_UPLOAD_CARD_CLASS =
  'flex aspect-square flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-white/[0.12] bg-white/[0.04] px-4 text-text-dark transition-colors hover:border-white/[0.18] hover:bg-white/[0.06]';

interface PendingUpload {
  id: string;
  fileName: string;
  previewUrl: string;
  status: 'uploading' | 'failed';
  error?: string;
}

interface LibraryItem {
  id: string | null;
  name: string;
  imageUrls: string[];
  raw: Record<string, unknown>;
}

export interface CharacterLibrarySelection {
  imageUrl: string;
  name: string;
}

export interface CharacterLibraryModalProps {
  open: boolean;
  project: string | null;
  onClose: () => void;
  onSuccess?: () => void;
  onConfirm?: (selections: CharacterLibrarySelection[]) => void;
  maxSelectable?: number;
}

function makeId(): string {
  return `cl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function normalizeLibraryList(payload: unknown): LibraryItem[] {
  let arr: unknown[] = [];
  if (Array.isArray(payload)) {
    arr = payload;
  } else if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    for (const key of ['items', 'data', 'characters', 'list', 'records']) {
      if (Array.isArray(rec[key])) {
        arr = rec[key] as unknown[];
        break;
      }
    }
  }
  return arr
    .filter(
      (it): it is Record<string, unknown> =>
        Boolean(it && typeof it === 'object' && !Array.isArray(it)),
    )
    .map((it) => {
      const idRaw = it.id ?? it.item_id ?? it.itemId ?? null;
      const id =
        typeof idRaw === 'string'
          ? idRaw
          : idRaw != null
            ? String(idRaw)
            : null;
      const name = typeof it.name === 'string' ? it.name : '';
      const urlsRaw =
        (it.image_urls as unknown) ??
        (it.imageUrls as unknown) ??
        (it.images as unknown) ??
        [];
      const imageUrls = Array.isArray(urlsRaw)
        ? urlsRaw.filter((u): u is string => typeof u === 'string')
        : [];
      return { id, name, imageUrls, raw: it };
    });
}

export function CharacterLibraryModal({
  open,
  project,
  onClose,
  onSuccess,
  onConfirm,
  maxSelectable = 9,
}: CharacterLibraryModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const pendingRef = useRef<PendingUpload[]>([]);
  pendingRef.current = pendingUploads;
  const [isDragging, setIsDragging] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const refreshLibrary = useCallback(async () => {
    if (!project) return;
    setIsLoadingLibrary(true);
    setLibraryError(null);
    try {
      const payload = await fetchFreezoneVideoCharacterLibrary(project);
      setLibrary(normalizeLibraryList(payload));
    } catch (err) {
      console.error('[character-library] fetch failed', err);
      setLibraryError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [project]);

  useEffect(() => {
    if (!open || !project) return;
    void refreshLibrary();
  }, [open, project, refreshLibrary]);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPendingUploads([]);
      setLibrary([]);
      setLibraryError(null);
      setDeletingId(null);
      setIsDragging(false);
      setSelectedKeys([]);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const removePending = useCallback((id: string) => {
    setPendingUploads((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const uploadOne = useCallback(
    async (entry: PendingUpload, file: File) => {
      if (!project) return;
      try {
        const uploaded = await uploadFreezoneImage(project, file, file.name);
        const cleanUrl = uploaded.url.split('?')[0];
        await submitFreezoneAddVideoCharacterLibraryItem(project, {
          name: stripExtension(file.name),
          imageUrls: [cleanUrl],
        });
        URL.revokeObjectURL(entry.previewUrl);
        setPendingUploads((prev) => prev.filter((p) => p.id !== entry.id));
        await refreshLibrary();
        onSuccess?.();
      } catch (err) {
        console.error('[character-library] upload failed', err);
        const message = err instanceof Error ? err.message : String(err);
        setPendingUploads((prev) =>
          prev.map((p) =>
            p.id === entry.id ? { ...p, status: 'failed', error: message } : p,
          ),
        );
      }
    },
    [project, refreshLibrary, onSuccess],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (!project) return;
      const accepted: { entry: PendingUpload; file: File }[] = [];
      Array.from(files).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        const entry: PendingUpload = {
          id: makeId(),
          fileName: file.name,
          previewUrl: URL.createObjectURL(file),
          status: 'uploading',
        };
        accepted.push({ entry, file });
      });
      if (accepted.length === 0) return;
      setPendingUploads((prev) => [...prev, ...accepted.map((a) => a.entry)]);
      accepted.forEach(({ entry, file }) => {
        void uploadOne(entry, file);
      });
    },
    [project, uploadOne],
  );

  const handleDeleteEntry = useCallback(
    async (entry: LibraryItem) => {
      if (!project || !entry.id) return;
      const confirmed = window.confirm(
        `确定要删除「${entry.name || entry.id}」？`,
      );
      if (!confirmed) return;
      setDeletingId(entry.id);
      try {
        await deleteFreezoneVideoCharacterLibraryItem(project, entry.id);
        await refreshLibrary();
      } catch (err) {
        console.error('[character-library] delete failed', err);
        setLibraryError(err instanceof Error ? err.message : String(err));
      } finally {
        setDeletingId(null);
      }
    },
    [project, refreshLibrary],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer?.files?.length) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const selectableEntries = useMemo(
    () =>
      library
        .map((entry) => {
          const url = entry.imageUrls[0];
          if (!url) return null;
          const key = entry.id ?? `url:${url}`;
          return { key, url, name: entry.name, entry };
        })
        .filter((it): it is { key: string; url: string; name: string; entry: LibraryItem } =>
          Boolean(it),
        ),
    [library],
  );

  const isSelected = useCallback(
    (key: string) => selectedKeys.includes(key),
    [selectedKeys],
  );

  const toggleSelect = useCallback(
    (key: string) => {
      setSelectedKeys((prev) => {
        if (prev.includes(key)) return prev.filter((k) => k !== key);
        if (prev.length >= maxSelectable) return prev;
        return [...prev, key];
      });
    },
    [maxSelectable],
  );

  const handleConfirm = useCallback(() => {
    if (selectedKeys.length === 0) {
      onClose();
      return;
    }
    if (onConfirm) {
      const byKey = new Map(selectableEntries.map((it) => [it.key, it]));
      const selections: CharacterLibrarySelection[] = [];
      for (const key of selectedKeys) {
        const it = byKey.get(key);
        if (it) selections.push({ imageUrl: it.url, name: it.name });
      }
      onConfirm(selections);
    }
    onClose();
  }, [onClose, onConfirm, selectableEntries, selectedKeys]);

  if (typeof document === 'undefined' || !open) return null;

  const totalCount = library.length + pendingUploads.length;
  const selectedCount = selectedKeys.length;
  const hasSelection = selectedCount > 0;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        className={CHARACTER_LIBRARY_MODAL_CLASS}
        onClick={(event) => event.stopPropagation()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        {/* Title bar */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text-dark">角色库</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted/90 transition-colors hover:bg-white/[0.08] hover:text-text-dark"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs + counter */}
        <div className="flex shrink-0 items-center px-5 pb-4">
          <div className="flex items-center gap-3 text-xs text-text-muted/85">
            <span>
              已录入 <span className="text-text-dark">{totalCount}</span> 个
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span>
              已选{' '}
              <span className={hasSelection ? 'text-primary' : 'text-text-dark'}>
                {selectedCount}
              </span>
              /{maxSelectable} 张
            </span>
            {isLoadingLibrary && (
              <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin text-text-muted" />
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="ui-scrollbar relative flex-1 overflow-y-auto px-5 pb-2">
          {isDragging && (
            <div className="pointer-events-none absolute inset-x-5 inset-y-0 z-10 flex items-center justify-center rounded-[8px] border border-dashed border-accent/60 bg-accent/10 text-sm text-text-dark">
              松开以上传图片
            </div>
          )}
          {libraryError && (
            <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
              加载失败：{libraryError}
            </div>
          )}
          <div
            className="grid gap-3.5"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 176px))',
            }}
          >
            {/* Upload card */}
            <div className={CHARACTER_LIBRARY_UPLOAD_CARD_CLASS}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!project}
                className="inline-flex h-8 items-center justify-center rounded-md bg-white/[0.10] px-4 text-xs font-medium text-text-dark transition-colors hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                本地上传
              </button>
              <div className="text-[11px] text-text-muted/75">
                支持 PNG / JPG / WebP，可拖入
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) handleFiles(event.target.files);
                event.target.value = '';
              }}
            />

            {/* In-flight uploads */}
            {pendingUploads.map((p) => (
              <div
                key={p.id}
                className={`group relative aspect-square ${CHARACTER_LIBRARY_CARD_CLASS}`}
              >
                <img
                  src={p.previewUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-70"
                  draggable={false}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45">
                  {p.status === 'uploading' ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                      <div className="text-[11px] text-white/90">上传中…</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] text-red-300">上传失败</div>
                      {p.error && (
                        <div className="px-2 text-[10px] text-red-200/80 line-clamp-2 text-center">
                          {p.error}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {p.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => removePending(p.id)}
                    className="absolute right-2 bottom-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white transition-colors hover:bg-black/75"
                    title="移除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {/* Existing items */}
            {library.map((entry, idx) => {
              const url = entry.imageUrls[0];
              const isDeleting = deletingId != null && entry.id === deletingId;
              const selectableKey = url ? (entry.id ?? `url:${url}`) : null;
              const selected = selectableKey ? isSelected(selectableKey) : false;
              const disabledSelect =
                !selectableKey ||
                (!selected && selectedCount >= maxSelectable);
              return (
                <div
                  key={entry.id ?? `idx-${idx}`}
                  className={`group relative aspect-square ${CHARACTER_LIBRARY_CARD_CLASS} ${
                    selected
                      ? 'border-accent/70 ring-1 ring-accent/45'
                      : CHARACTER_LIBRARY_CARD_HOVER_CLASS
                  } ${selectableKey ? 'cursor-pointer' : ''}`}
                  onClick={() => {
                    if (!selectableKey || disabledSelect) return;
                    toggleSelect(selectableKey);
                  }}
                >
                  {url ? (
                    <img
                      src={resolveImageDisplayUrl(url)}
                      alt={entry.name}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] text-text-muted/60">
                      无图
                    </div>
                  )}

                  {/* Checkbox top-left */}
                  {selectableKey && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (disabledSelect) return;
                        toggleSelect(selectableKey);
                      }}
                      disabled={disabledSelect}
                      title={
                        disabledSelect && !selected
                          ? `最多可选 ${maxSelectable} 张`
                          : selected
                            ? '取消选择'
                            : '选择'
                      }
                      className={`absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? 'border-accent bg-accent text-white'
                          : 'border-white/70 bg-black/35 text-transparent hover:border-white'
                      } ${
                        disabledSelect && !selected
                          ? 'cursor-not-allowed opacity-40'
                          : ''
                      }`}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </button>
                  )}

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 text-xs text-white">
                    <div className="truncate">{entry.name || '(未命名)'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteEntry(entry);
                    }}
                    disabled={!entry.id || isDeleting}
                    className="absolute right-2 bottom-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-[opacity,background-color] hover:bg-black/80 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title={entry.id ? '删除' : '该条目缺少 id，无法删除'}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {!isLoadingLibrary && library.length === 0 && pendingUploads.length === 0 && !libraryError && (
            <div className="mt-3 text-center text-[11px] text-text-muted/70">
              暂未录入角色，点击「本地上传」或将图片拖入此处。
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 px-5 pb-3 pt-2">
          <UiButton
            variant="primary"
            className="h-8 rounded-md bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90"
            disabled={!hasSelection}
            onClick={handleConfirm}
          >
            确定
          </UiButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
