// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type {
  ImageModelDefinition,
  ImageModelRuntimeContext,
  ModelProviderDefinition,
  ResolutionOption,
} from './types';

const providerModules = import.meta.glob<{ provider: ModelProviderDefinition }>(
  './providers/*.ts',
  { eager: true }
);
const modelModules = import.meta.glob<{ imageModel: ImageModelDefinition }>(
  './image/**/*.ts',
  { eager: true }
);

const SUPERTALE_PROVIDER_IDS = new Set(['huimeng', 'openai', 'openrouter']);
const SUPERTALE_IMAGE_MODEL_IDS = new Set([
  'huimeng/default',
  'openai/gpt-image-2',
  'openrouter/default',
]);

const providers: ModelProviderDefinition[] = Object.values(providerModules)
  .map((module) => module.provider)
  .filter((provider): provider is ModelProviderDefinition => Boolean(provider))
  .filter((provider) => SUPERTALE_PROVIDER_IDS.has(provider.id))
  .sort((a, b) => a.id.localeCompare(b.id));

const imageModels: ImageModelDefinition[] = Object.values(modelModules)
  .map((module) => module.imageModel)
  .filter((model): model is ImageModelDefinition => Boolean(model))
  .filter((model) => SUPERTALE_IMAGE_MODEL_IDS.has(model.id))
  .sort((a, b) => a.id.localeCompare(b.id));

const providerMap = new Map<string, ModelProviderDefinition>(
  providers.map((provider) => [provider.id, provider])
);
const imageModelMap = new Map<string, ImageModelDefinition>(
  imageModels.map((model) => [model.id, model])
);

// Freezone is SuperTale-project scoped, not BYO-provider scoped. Expose only
// backend-supported image providers; old canvas model ids are normalized by the
// alias map below instead of keeping old provider modules in the bundle.
export const DEFAULT_IMAGE_MODEL_ID = 'openrouter/default';

const imageModelAliasMap = new Map<string, string>([
  ['gemini-3.1-flash', DEFAULT_IMAGE_MODEL_ID],
  ['gemini-3.1-flash-edit', DEFAULT_IMAGE_MODEL_ID],
  ['ppio/gemini-3.1-flash', DEFAULT_IMAGE_MODEL_ID],
  ['google/gemini-3-pro-image', DEFAULT_IMAGE_MODEL_ID],
  ['volcengine/seedream-4', 'huimeng/default'],
  ['fal/nano-banana-2', DEFAULT_IMAGE_MODEL_ID],
  ['fal/nano-banana-pro', DEFAULT_IMAGE_MODEL_ID],
  ['kie/nano-banana-2', DEFAULT_IMAGE_MODEL_ID],
  ['kie/nano-banana-pro', DEFAULT_IMAGE_MODEL_ID],
  ['grsai/nano-banana-2', DEFAULT_IMAGE_MODEL_ID],
  ['grsai/nano-banana-pro', DEFAULT_IMAGE_MODEL_ID],
]);

export function listImageModels(): ImageModelDefinition[] {
  return imageModels;
}

export function listModelProviders(): ModelProviderDefinition[] {
  return providers;
}

export function getImageModel(modelId: string): ImageModelDefinition {
  const resolvedModelId = imageModelAliasMap.get(modelId) ?? modelId;
  return imageModelMap.get(resolvedModelId) ?? imageModelMap.get(DEFAULT_IMAGE_MODEL_ID)!;
}

export function resolveImageModelResolutions(
  model: ImageModelDefinition,
  context: ImageModelRuntimeContext = {}
): ResolutionOption[] {
  const resolvedOptions = model.resolveResolutions?.(context);
  return resolvedOptions && resolvedOptions.length > 0 ? resolvedOptions : model.resolutions;
}

export function resolveImageModelResolution(
  model: ImageModelDefinition,
  requestedResolution: string | undefined,
  context: ImageModelRuntimeContext = {}
): ResolutionOption {
  const resolutionOptions = resolveImageModelResolutions(model, context);

  return (
    (requestedResolution
      ? resolutionOptions.find((item) => item.value === requestedResolution)
      : undefined) ??
    resolutionOptions.find((item) => item.value === model.defaultResolution) ??
    resolutionOptions[0] ??
    model.resolutions[0]
  );
}

export function getModelProvider(providerId: string): ModelProviderDefinition {
  return (
    providerMap.get(providerId) ?? {
      id: 'unknown',
      name: 'Unknown Provider',
      label: 'Unknown',
    }
  );
}
