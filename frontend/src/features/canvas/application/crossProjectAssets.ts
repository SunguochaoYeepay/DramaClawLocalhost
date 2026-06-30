// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { uploadFreezoneImage } from '@/api/ops';
import type { CanvasNodeData } from '@/features/canvas/domain/canvasNodes';

/**
 * 跨项目粘贴时的资产迁移。
 *
 * 画布的复制/粘贴只是深拷贝节点数据，媒体 URL（videoUrl / imageUrl / audioUrl …）
 * 原样保留，仍指向「源项目」的静态路径。粘贴到另一个项目后，这些资产并不属于
 * 目标项目（不进素材库、源项目一删即失效，视频尤其直接加载不出）。
 *
 * 这里把粘贴进来的节点里的媒体资产 fetch 下来、重新上传到目标项目，再把节点数据里
 * 的 URL 静默改写成目标项目的新地址。后台执行、不阻塞粘贴；单条失败则保留原 URL。
 *
 * 识别策略：递归遍历节点数据，凡是 key 以 `Url` 结尾、值是「同源 /static 或 /api 媒体
 * 路径」的字符串就迁移。这样无需维护字段白名单，叠卡画册 / 分镜帧等嵌套结构也自动覆盖。
 */

// 同时进行的上传数上限——视频可能几十 MB，无限并发会撑爆内存 / 触发后端限流。
const MAX_CONCURRENT_UPLOADS = 4;

/**
 * 把存储的原始 URL 归一化成「可直接 fetch 的同源地址」。
 *
 * 关键：**不**走 `resolveMediaUrl`——它会把 legacy `/static/<user>/<project>/…`
 * 按当前路由项目重锚定，从而读到目标项目里并不存在的文件。迁移要拿的是源项目的字节，
 * 因此直接用存储路径打到 `/static`（代理按路径直供，与「当前项目」无关）。
 */
function toFetchableAssetUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  // data: / blob: 不是跨项目静态资产；protocol-relative 一律拒绝。
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('//')) {
    return null;
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  let parsed: URL;
  try {
    parsed = new URL(trimmed, origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  // 跨源媒体本部署不支持（后端 /static 始终同源经边缘代理）。
  if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
    return null;
  }
  if (!parsed.pathname.startsWith('/static/') && !parsed.pathname.startsWith('/api/')) {
    return null;
  }
  return parsed.origin + parsed.pathname + parsed.search;
}

function filenameFromUrl(fetchUrl: string): string {
  try {
    const parsed = new URL(fetchUrl);
    const base = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
    return base || 'pasted-asset';
  } catch {
    return 'pasted-asset';
  }
}

async function uploadAssetToProject(rawUrl: string, targetProject: string): Promise<string> {
  const fetchUrl = toFetchableAssetUrl(rawUrl);
  if (!fetchUrl) {
    return rawUrl;
  }
  const response = await fetch(fetchUrl, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`fetch source asset failed: ${response.status}`);
  }
  const blob = await response.blob();
  // 与图片同一个 /freezone/upload 接口，后端按通用 blob 处理；timeoutMs:false 关掉
  // ky 默认 30s 超时，避免大视频上传被中断。
  const uploaded = await uploadFreezoneImage(targetProject, blob, filenameFromUrl(fetchUrl), {
    timeoutMs: false,
  });
  return uploaded.url;
}

interface RemapResult {
  value: unknown;
  changed: boolean;
}

/** 收集一份节点数据里所有「可迁移」的媒体资产 URL（key 以 Url 结尾、值是同源静态资产）。 */
function collectAssetUrls(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAssetUrls(item, out);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === 'string' && /url$/i.test(key)) {
        if (toFetchableAssetUrl(child)) {
          out.add(child);
        }
        continue;
      }
      collectAssetUrls(child, out);
    }
  }
}

/** 纯函数：把节点数据里命中 `urlMap` 的资产 URL 换成新地址，未命中的原样保留。 */
function remapAssetUrls(value: unknown, urlMap: Map<string, string>): RemapResult {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = remapAssetUrls(item, urlMap);
      if (result.changed) {
        changed = true;
      }
      return result.value;
    });
    return { value: changed ? next : value, changed };
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = { ...source };
    for (const [key, child] of Object.entries(source)) {
      if (typeof child === 'string' && /url$/i.test(key)) {
        const mapped = urlMap.get(child);
        if (mapped !== undefined && mapped !== child) {
          next[key] = mapped;
          changed = true;
        }
        continue;
      }
      const result = remapAssetUrls(child, urlMap);
      if (result.changed) {
        next[key] = result.value;
        changed = true;
      }
    }
    return { value: changed ? next : value, changed };
  }

  return { value, changed: false };
}

/**
 * 并发上限调度器：最多 `max` 个上传同时进行，其余排队。避免一次粘贴大量媒体节点时
 * 瞬间发起几十上百个 fetch+上传请求，撑爆内存 / 触发后端限流。
 */
function createUploadLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];
  const release = () => {
    active -= 1;
    const run = queue.shift();
    if (run) {
      run();
    }
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        task().then(resolve, reject).finally(release);
      };
      if (active < max) {
        start();
      } else {
        queue.push(start);
      }
    });
}

export interface PastedNodeForMigration {
  id: string;
  data: CanvasNodeData;
}

export interface AssetMigrationSummary {
  /** 成功迁移的去重资产数。 */
  migrated: number;
  /** 迁移失败、保留原 URL 的去重资产数。 */
  failed: number;
}

/**
 * 把一组刚粘贴进来的节点里的媒体资产迁移到 `targetProject`。
 *
 * 分三步：(1) 从粘贴快照里收集去重的资产 URL；(2) 限并发地 fetch+重新上传，得到
 * 旧→新 URL 映射；(3) 用 `getLiveNodeData` 读取**当前**节点数据（而非粘贴时的快照）做
 * 纯改写——这样上传期间用户对节点的编辑（改 URL、往画册加卡片等）不会被旧快照覆盖；
 * 节点若已被删除 / 切走项目则跳过。相同 URL 只上传一次。
 */
export async function migratePastedNodeAssets(params: {
  nodes: PastedNodeForMigration[];
  targetProject: string;
  getLiveNodeData: (id: string) => CanvasNodeData | null;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
}): Promise<AssetMigrationSummary> {
  const { nodes, targetProject, getLiveNodeData, updateNodeData } = params;

  // 1. 从快照收集去重的可迁移资产 URL。
  const urls = new Set<string>();
  for (const { data } of nodes) {
    collectAssetUrls(data, urls);
  }
  if (urls.size === 0) {
    return { migrated: 0, failed: 0 };
  }

  // 2. 限并发 fetch + 重新上传到目标项目，构建旧→新 URL 映射。
  const limit = createUploadLimiter(MAX_CONCURRENT_UPLOADS);
  const urlMap = new Map<string, string>();
  let migrated = 0;
  let failed = 0;
  await Promise.all(
    [...urls].map((url) =>
      limit(() => uploadAssetToProject(url, targetProject))
        .then((newUrl) => {
          if (newUrl !== url) {
            urlMap.set(url, newUrl);
            migrated += 1;
          }
        })
        .catch((error) => {
          failed += 1;
          console.warn('[cross-project-assets] migrate failed, keeping original', { url, error });
        }),
    ),
  );
  if (urlMap.size === 0) {
    return { migrated, failed };
  }

  // 3. 用「当前」节点数据做纯改写，避免覆盖上传期间用户的并发编辑；节点已不在则跳过。
  for (const { id } of nodes) {
    const liveData = getLiveNodeData(id);
    if (!liveData) {
      continue;
    }
    const result = remapAssetUrls(liveData, urlMap);
    if (!result.changed) {
      continue;
    }
    const nextData = result.value as Record<string, unknown>;
    const previousData = liveData as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(nextData)) {
      if (nextData[key] !== previousData[key]) {
        patch[key] = nextData[key];
      }
    }
    if (Object.keys(patch).length > 0) {
      updateNodeData(id, patch as Partial<CanvasNodeData>);
    }
  }

  return { migrated, failed };
}
