// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type {
  SkillDefinition,
  SkillParameterSpec,
} from '@/features/freezone/context/skillRoles';

const PARAMETER_LABELS: Record<string, string> = {
  aspect_ratio: '比例',
  quality: '质量',
};

export interface SkillParameterEntry {
  key: string;
  label: string;
  type: string;
  options: string[];
  value: string | boolean;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function parameterOptions(spec: SkillParameterSpec): string[] {
  return Array.isArray(spec.options)
    ? spec.options.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

export function selectedParameterValue(
  key: string,
  spec: SkillParameterSpec,
  storedParameters: Record<string, unknown>,
): string | boolean {
  if (spec.type === 'boolean') {
    const storedValue = storedParameters[key];
    if (typeof storedValue === 'boolean') {
      return storedValue;
    }
    if (typeof storedValue === 'string') {
      const normalized = storedValue.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return typeof spec.default === 'boolean' ? spec.default : false;
  }

  const options = parameterOptions(spec);
  const storedValue = typeof storedParameters[key] === 'string' ? storedParameters[key].trim() : '';
  if (storedValue && (options.length === 0 || options.includes(storedValue))) {
    return storedValue;
  }
  const defaultValue = typeof spec.default === 'string' ? spec.default.trim() : '';
  if (defaultValue && (options.length === 0 || options.includes(defaultValue))) {
    return defaultValue;
  }
  return options[0] ?? '';
}

export function skillParameterEntries(
  skill: SkillDefinition | null,
  parameters: unknown,
): SkillParameterEntry[] {
  const definitions = skill?.parameters ?? {};
  const storedParameters = recordValue(parameters) ?? {};
  return Object.entries(definitions)
    .map(([key, spec]) => {
      const options = parameterOptions(spec);
      const type = typeof spec.type === 'string' ? spec.type : 'string';
      return {
        key,
        label: typeof spec.label === 'string' && spec.label.trim()
          ? spec.label.trim()
          : PARAMETER_LABELS[key] ?? key,
        type,
        options,
        value: selectedParameterValue(key, spec, storedParameters),
      };
    })
    .filter((entry) => entry.type === 'boolean' || entry.options.length > 0);
}

export function normalizedSkillParameters(
  skill: SkillDefinition | null,
  parameters: unknown,
): Record<string, unknown> {
  return Object.fromEntries(
    skillParameterEntries(skill, parameters).map((entry) => [entry.key, entry.value]),
  );
}
