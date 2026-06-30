// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, expect, it } from 'vitest';

import { TaskCompletionError } from '@/api/tasks';
import {
  buildImageGenerationSuccessPatch,
  isStaleGenerationTask,
  shouldWriteGenerationError,
} from '@/features/canvas/application/generationTaskArbitration';

describe('generation task arbitration', () => {
  it('clears stale generation errors when an image generation succeeds', () => {
    expect(buildImageGenerationSuccessPatch('/outputs/image.png')).toEqual({
      imageUrl: '/outputs/image.png',
      previewImageUrl: '/outputs/image.png',
      isGenerating: false,
      generationStartedAt: null,
      generationError: null,
      generationErrorDetails: null,
      generationErrorRequestId: null,
    });
  });

  it('does not write a cancelled error over an existing generated image', () => {
    const shouldWrite = shouldWriteGenerationError({
      nodeData: {
        imageUrl: '/outputs/image.png',
        generationTaskKey: 'task-current',
      },
      taskKey: 'task-current',
      error: new TaskCompletionError('task cancelled', 'cancelled', 'task-current'),
    });

    expect(shouldWrite).toBe(false);
  });

  it('does not write errors from stale tasks that are no longer registered on the node', () => {
    const shouldWrite = shouldWriteGenerationError({
      nodeData: {
        generationTaskKey: 'task-newer',
      },
      taskKey: 'task-older',
      error: new Error('task failed'),
    });

    expect(shouldWrite).toBe(false);
  });

  it('identifies stale task settlements separately from current task settlements', () => {
    expect(isStaleGenerationTask({
      nodeData: { generationTaskKey: 'task-newer' },
      taskKey: 'task-older',
    })).toBe(true);
    expect(isStaleGenerationTask({
      nodeData: { generationTaskKey: 'task-current' },
      taskKey: 'task-current',
    })).toBe(false);
  });

  it('writes errors from the current failed task when there is no successful image', () => {
    const shouldWrite = shouldWriteGenerationError({
      nodeData: {
        generationTaskKey: 'task-current',
      },
      taskKey: 'task-current',
      error: new TaskCompletionError('provider failed', 'failed', 'task-current'),
    });

    expect(shouldWrite).toBe(true);
  });

  it('writes cancelled errors for the current task when the node has no generated media', () => {
    const shouldWrite = shouldWriteGenerationError({
      nodeData: {
        generationTaskKey: 'task-current',
      },
      taskKey: 'task-current',
      error: new TaskCompletionError('task cancelled', 'cancelled', 'task-current'),
    });

    expect(shouldWrite).toBe(true);
  });
});

