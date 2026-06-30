// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
// Parse + push freezone URL params for /projects/<project_id>/freezone?canvas=<id>.
// Mutating these uses History API so back/forward keep working.

export interface FreezoneUrl {
  /** SuperTale project_id. Display names are not accepted by project-scoped APIs. */
  project: string | null;
  canvas: string | null;
}

export interface WriteUrlOptions {
  replace?: boolean;
  notify?: boolean;
}

const LAST_CANVAS_PREFIX = "supertale.freezone.lastCanvas.";

function projectFromPathname(pathname = window.location.pathname): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/freezone(?:\/|$)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function readUrl(): FreezoneUrl {
  const params = new URLSearchParams(window.location.search);
  return {
    project: projectFromPathname() ?? params.get("p"),
    canvas: params.get("canvas"),
  };
}

export function writeUrl(next: Partial<FreezoneUrl>, options: WriteUrlOptions = {}) {
  const pathProject = projectFromPathname();
  if (!pathProject) return;

  const current = readUrl();
  // 显式区分"未传"和"传 null"：?? 会把 null 当作回退到 current，导致
  // writeUrl({ project: null }) 这种"清空字段"的语义失效（例如返回项目列表）。
  const merged: FreezoneUrl = {
    project: "project" in next ? next.project ?? null : current.project,
    canvas: "canvas" in next ? next.canvas ?? null : current.canvas,
  };
  const params = new URLSearchParams();
  if (merged.canvas) params.set("canvas", merged.canvas);
  const search = params.toString();
  const pathname =
    pathProject && merged.project
      ? `/projects/${encodeURIComponent(merged.project)}/freezone`
      : `/projects/${encodeURIComponent(pathProject)}/ingest`;
  const newUrl = `${pathname}${search ? `?${search}` : ""}`;
  if (options.replace) {
    window.history.replaceState({}, "", newUrl);
  } else {
    window.history.pushState({}, "", newUrl);
  }
  if (options.notify !== false) {
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function readLastCanvas(projectId: string | null | undefined): string | null {
  if (!projectId) return null;
  try {
    const value = window.localStorage.getItem(`${LAST_CANVAS_PREFIX}${projectId}`);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function rememberLastCanvas(projectId: string | null | undefined, canvasId: string): void {
  if (!projectId || !canvasId) return;
  try {
    window.localStorage.setItem(`${LAST_CANVAS_PREFIX}${projectId}`, canvasId);
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

export function useUrlParam<K extends keyof FreezoneUrl>(_key: K): FreezoneUrl[K] {
  // Lightweight non-hook helper for places that want a synchronous read.
  return readUrl()[_key];
}
