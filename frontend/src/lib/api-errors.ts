// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { TFunction } from "i18next";
import { HTTPError } from "ky";

export class ProjectQueueLimitError extends Error {
  queueKind: string;
  limitScope: "project" | "user";

  constructor(
    queueKind: string,
    message: string,
    limitScope: "project" | "user" = "project",
  ) {
    super(message);
    this.name = "ProjectQueueLimitError";
    this.queueKind = queueKind;
    this.limitScope = limitScope;
  }
}

export class BackendStatusError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "BackendStatusError";
  }
}

function queueLabelForPlainMessage(queueKind: string): string {
  if (queueKind === "default") return "默认";
  if (queueKind === "video") return "视频";
  if (queueKind === "world") return "世界";
  if (queueKind === "ffmpeg") return "合成";
  return queueKind;
}

function projectQueueLimitPlainMessage(
  queueKind: string,
  limitScope: "project" | "user",
): string {
  const queueLabel = queueLabelForPlainMessage(queueKind);
  if (limitScope === "user") {
    return `你在当前项目${queueLabel}队列的任务已达个人上限`;
  }
  return `当前项目${queueLabel}队列已达团队上限`;
}

export function errorFromBackendBody(status: number, body: unknown, fallback: string): Error | null {
  if (!body || typeof body !== "object") return null;

  const data = (body as { data?: unknown }).data;
  const queueKind =
    data && typeof data === "object"
      ? (data as { queue_kind?: unknown }).queue_kind
      : undefined;
  const limitScope =
    data && typeof data === "object"
      ? (data as { limit_scope?: unknown }).limit_scope
      : undefined;
  const apiError = (body as { error?: unknown }).error;
  const detail = (body as { detail?: unknown }).detail;
  const message =
    typeof apiError === "string" && apiError.trim()
      ? apiError
      : typeof detail === "string" && detail.trim()
        ? detail
        : fallback;

  if (status === 429 && typeof queueKind === "string" && queueKind.trim()) {
    const normalizedScope = limitScope === "user" ? "user" : "project";
    return new ProjectQueueLimitError(
      queueKind,
      projectQueueLimitPlainMessage(queueKind, normalizedScope) || message,
      normalizedScope,
    );
  }
  if (typeof apiError === "string" && apiError.trim()) {
    return new BackendStatusError(apiError, status, body);
  }
  if (typeof detail === "string" && detail.trim()) {
    return new BackendStatusError(detail, status, body);
  }
  return null;
}

async function backendError(error: unknown): Promise<Error | null> {
  if (!(error instanceof HTTPError)) return null;
  const body = await error.response.json().catch(() => null);
  return errorFromBackendBody(error.response.status, body, error.message);
}

export async function jsonWithBackendError<T>(request: Promise<Response>): Promise<T> {
  try {
    const response = await request;
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const parsedError = errorFromBackendBody(response.status, body, response.statusText);
      if (parsedError) throw parsedError;
      throw new Error(response.statusText);
    }
    return body as T;
  } catch (error) {
    const parsedError = await backendError(error);
    if (parsedError) throw parsedError;
    throw error;
  }
}

export function backendErrorToastMessage(error: unknown, t: TFunction): string {
  if (error instanceof ProjectQueueLimitError) {
    const scopeSuffix = error.limitScope === "user" ? "UserFull" : "ProjectFull";
    if (error.queueKind === "default") {
      return t(`common.projectDefaultQueue${scopeSuffix}`, {
        defaultValue: t("common.projectDefaultQueueFull"),
      });
    }
    const queueLabel = t(`common.projectQueueKinds.${error.queueKind}`, {
      defaultValue: error.queueKind,
    });
    return t(`common.projectQueue${scopeSuffix}`, {
      queue: queueLabel,
      defaultValue: t("common.projectQueueFull", { queue: queueLabel }),
    });
  }
  return error instanceof Error && error.message ? error.message : t("common.error");
}
