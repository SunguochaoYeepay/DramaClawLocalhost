// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { ImageModelDefinition } from '../../types';

export const COMFYUI_QWEN_IMAGE_MODEL_ID = 'comfyui/qwen-image';

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'] as const;

export const imageModel: ImageModelDefinition = {
  id: COMFYUI_QWEN_IMAGE_MODEL_ID,
  mediaType: 'image',
  displayName: 'ComfyUI Qwen Image (Local)',
  providerId: 'comfyui',
  description: '本地 ComfyUI Qwen Image 工作流，支持文生图和参考图生成',
  eta: '60s',
  expectedDurationMs: 60000,
  defaultAspectRatio: '1:1',
  defaultResolution: '2K',
  aspectRatios: ASPECT_RATIOS.map((value) => ({ value, label: value })),
  resolutions: [
    { value: '1K', label: '1K' },
    { value: '2K', label: '2K' },
  ],
  resolveRequest: ({ referenceImageCount }) => ({
    requestModel: 'comfyui_qwen_image',
    modeLabel: referenceImageCount > 0 ? '编辑' : '生成',
  }),
};
