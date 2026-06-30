// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { TaskCompletionError } from '@/api/tasks';

type NodeGenerationData = Record<string, unknown>;

const GENERATED_MEDIA_FIELDS = [
  'imageUrl',
  'previewImageUrl',
  'videoUrl',
  'resultVideoUrl',
  'audioUrl',
] as const;

export function buildImageGenerationSuccessPatch(url: string): Record<string, unknown> {
  return {
    imageUrl: url,
    previewImageUrl: url,
    isGenerating: false,
    generationStartedAt: null,
    generationError: null,
    generationErrorDetails: null,
    generationErrorRequestId: null,
  };
}

export function isTaskCancelledError(error: unknown): boolean {
  return error instanceof TaskCompletionError && error.status === 'cancelled';
}

function nodeHasGeneratedMedia(nodeData: NodeGenerationData): boolean {
  return GENERATED_MEDIA_FIELDS.some((field) => {
    const value = nodeData[field];
    return typeof value === 'string' && value.length > 0;
  });
}

export function hasGeneratedMedia(nodeData: NodeGenerationData): boolean {
  return nodeHasGeneratedMedia(nodeData);
}

function registeredTaskKey(nodeData: NodeGenerationData): string {
  const value = nodeData.generationTaskKey;
  return typeof value === 'string' ? value : '';
}

export function isStaleGenerationTask({
  nodeData,
  taskKey,
}: {
  nodeData: NodeGenerationData;
  taskKey: string;
}): boolean {
  const currentTaskKey = registeredTaskKey(nodeData);
  return currentTaskKey.length > 0 && currentTaskKey !== taskKey;
}

export function shouldWriteGenerationError({
  nodeData,
  taskKey,
  error,
}: {
  nodeData: NodeGenerationData;
  taskKey: string;
  error: unknown;
}): boolean {
  if (isStaleGenerationTask({ nodeData, taskKey })) {
    return false;
  }

  if (isTaskCancelledError(error) && nodeHasGeneratedMedia(nodeData)) {
    return false;
  }

  return true;
}
