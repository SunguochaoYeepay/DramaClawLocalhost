// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { saveBeatDirectorControlFrame } from "@/api/viewerManifests";
import type { PushResult, PushTarget } from "@/api/push";

type DirectorRenderTarget = Extract<PushTarget, { kind: "director_render" }>;

export interface DirectorRenderCanvasCommitSource {
  sourceUrl: string;
  previewUrl?: string | null;
  bundle?: Record<string, unknown> | null;
  sourceNodeId?: string | null;
  label?: string | null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function fetchJsonRecord(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`读取导演元数据失败：${response.status}`);
  }
  const json = await response.json();
  const record = recordValue(json);
  if (!record) {
    throw new Error("导演元数据格式无效");
  }
  return record;
}

async function urlToPngDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`读取导演图层失败：${response.status}`);
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result.startsWith("data:image/")) {
        resolve(result);
      } else if (result.startsWith("data:")) {
        const commaIndex = result.indexOf(",");
        resolve(commaIndex >= 0
          ? `data:image/png;base64,${result.slice(commaIndex + 1)}`
          : result);
      } else {
        reject(new Error("导演图层不是图片 data URL"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("读取导演图层失败"));
    reader.readAsDataURL(blob);
  });
}

function completeBundleParts(bundle: Record<string, unknown> | null | undefined) {
  const relPaths = recordValue(bundle?.rel_paths);
  const urls = recordValue(bundle?.urls);
  const combinedUrl = stringValue(urls?.combined);
  const envOnlyUrl = stringValue(urls?.env_only);
  const frameMetaUrl = stringValue(urls?.frame_meta);
  if (!combinedUrl || !envOnlyUrl || !frameMetaUrl) {
    return null;
  }
  return {
    combinedRelPath: stringValue(relPaths?.combined),
    combinedUrl,
    envOnlyUrl,
    frameMetaUrl,
  };
}

function manualFrameMeta(source: DirectorRenderCanvasCommitSource): Record<string, unknown> {
  const sourceId = source.sourceNodeId
    ? `manual_canvas_commit:${source.sourceNodeId}`
    : "manual_canvas_commit";
  return {
    schema_version: "director_frame_meta_v1",
    source: {
      source_id: sourceId,
      source_type: "sog",
      source_kind: "custom",
      label: source.label || "画布手动提交",
      url: source.sourceUrl,
    },
    camera: {
      mode: "sog",
      frame_aspect: "16:9",
      state: {},
    },
    layer: {
      source_id: sourceId,
      actors: [],
      props: [],
      stagings: [],
    },
    commit_source: "manual_canvas_commit",
  };
}

export async function commitDirectorRenderFromCanvasSource(
  project: string,
  target: DirectorRenderTarget,
  source: DirectorRenderCanvasCommitSource,
): Promise<PushResult> {
  const bundle = recordValue(source.bundle);
  const parts = completeBundleParts(bundle);
  const frameMetaRecord: Record<string, unknown> = parts
    ? recordValue(bundle?.frame_meta) ?? await fetchJsonRecord(parts.frameMetaUrl)
    : manualFrameMeta(source);
  const combinedDataUrl = parts
    ? await urlToPngDataUrl(parts.combinedUrl)
    : await urlToPngDataUrl(source.sourceUrl);
  const envOnlyDataUrl = parts
    ? await urlToPngDataUrl(parts.envOnlyUrl)
    : combinedDataUrl;

  const result = await saveBeatDirectorControlFrame(project, target.episode, target.beat, {
    frame_aspect: stringValue(frameMetaRecord.frame_aspect) ||
      stringValue(recordValue(frameMetaRecord.camera)?.frame_aspect) ||
      "16:9",
    source: recordValue(frameMetaRecord.source) ?? recordValue(bundle?.source) ?? undefined,
    frame_meta: frameMetaRecord,
    images: {
      combined: combinedDataUrl,
      env_only: envOnlyDataUrl,
    },
  });

  const targetPath = stringValue(result.rel_paths.combined) || parts?.combinedRelPath || "";
  const targetUrl = stringValue(result.urls?.combined);
  if (!targetPath || !targetUrl) {
    throw new Error("导演合成图写入后缺少目标路径");
  }
  return {
    target_path: targetPath,
    target_url: targetUrl,
    backup: null,
  };
}
