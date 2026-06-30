// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { GenerationCapability } from "./capabilityRegistry";
import { stringifyParamValue } from "./capabilityRegistry";

function commonRefs() {
  return [
    {
      key: "base_ref",
      label: "主参考图",
      required: false,
      acceptKinds: ["generic", "scene", "identity", "portrait", "prop", "sketch", "render"],
      description: "第一张连入图会作为 edit base；不连图时走 text-to-image。",
    },
    {
      key: "extra_refs",
      label: "辅助参考",
      required: false,
      acceptKinds: ["generic", "scene", "identity", "portrait", "prop", "sketch", "render"],
    },
  ];
}

const STYLE_PARAM = {
  key: "style",
  label: "风格",
  type: "enum" as const,
  defaultValue: "supertale_production",
  options: [
    { value: "supertale_production", label: "SuperTale 生产风格" },
    { value: "cinematic_realistic", label: "影视写实" },
    { value: "clean_sketch", label: "干净线稿" },
    { value: "spiderverse_mixed", label: "混合媒介" },
  ],
};

function suffix(params: Record<string, unknown>, nodePrompt?: string): string {
  const style = stringifyParamValue(params.style) || "supertale_production";
  const notes = stringifyParamValue(params.notes);
  return `

Style: ${style}.
${notes ? `Extra notes: ${notes}.` : ""}
${nodePrompt ? `Node note:\n${nodePrompt}` : ""}

Hard requirements:
- Production-ready SuperTale asset candidate.
- No text, watermark, UI frame, contact sheet, or collage unless explicitly requested.
- Preserve useful identity / scene / prop cues from references.`;
}

export const sceneMasterCandidateCapability: GenerationCapability = {
  id: "scene_master_candidate",
  name: "场景主图候选",
  shortName: "场景主图",
  category: "scene",
  description: "生成或修复 scene master 候选图，满意后 Commit 到 scene_master slot。",
  outputKind: "scene_master",
  model: "openai/gpt-image-2",
  aspectRatio: "16:9",
  imageSize: "2K",
  inputs: commonRefs(),
  params: [
    { key: "scene_id", label: "场景 ID", type: "text", defaultValue: "" },
    STYLE_PARAM,
    { key: "notes", label: "补充要求", type: "text", defaultValue: "" },
  ],
  compose({ inputUrls, params, nodePrompt }) {
    const sceneId = stringifyParamValue(params.scene_id) || "the target scene";
    return {
      prompt: `Create a canonical scene master image candidate for ${sceneId}.

Represent the stable layout, mood, key architectural features, materials, and color palette of the scene.${suffix(params, nodePrompt)}`,
      referenceUrls: inputUrls,
      model: "openai/gpt-image-2",
      aspectRatio: "16:9",
      imageSize: "2K",
      quality: "medium",
      outputKind: "scene_master",
    };
  },
};

export const scene360CandidateCapability: GenerationCapability = {
  id: "scene_360_candidate",
  name: "场景 360 候选",
  shortName: "场景360",
  category: "scene",
  description: "生成 2:1 场景全景候选图，满意后 Commit 到 Director Pano 360 slot。",
  outputKind: "scene_director_pano_360",
  model: "openai/gpt-image-2",
  aspectRatio: "2:1",
  imageSize: "4K",
  inputs: commonRefs(),
  params: [
    { key: "scene_id", label: "场景 ID", type: "text", defaultValue: "" },
    STYLE_PARAM,
    { key: "notes", label: "补充要求", type: "text", defaultValue: "" },
  ],
  compose({ inputUrls, params, nodePrompt }) {
    const sceneId = stringifyParamValue(params.scene_id) || "the target scene";
    return {
      prompt: `Create a 2:1 equirectangular 360 panorama candidate for ${sceneId}.

The panorama must be horizontally seamless and suitable as a 3GS / director-world environment reference.${suffix(params, nodePrompt)}`,
      referenceUrls: inputUrls,
      model: "openai/gpt-image-2",
      aspectRatio: "2:1",
      imageSize: "4K",
      quality: "medium",
      outputKind: "scene_director_pano_360",
    };
  },
};

export const propRefCandidateCapability: GenerationCapability = {
  id: "prop_ref_candidate",
  name: "道具参考候选",
  shortName: "道具参考",
  category: "utility",
  description: "生成道具 reference_3view 候选图，满意后 Commit 到 prop_ref slot。",
  outputKind: "prop_ref",
  model: "openai/gpt-image-2",
  aspectRatio: "16:9",
  imageSize: "2K",
  inputs: commonRefs(),
  params: [
    { key: "prop_id", label: "道具 ID", type: "text", defaultValue: "" },
    STYLE_PARAM,
    { key: "notes", label: "补充要求", type: "text", defaultValue: "" },
  ],
  compose({ inputUrls, params, nodePrompt }) {
    const propId = stringifyParamValue(params.prop_id) || "the target prop";
    return {
      prompt: `Create a clean prop reference candidate for ${propId}.

Show the prop clearly with stable design, color, material, scale cues, and if useful a simple 3-view layout.${suffix(params, nodePrompt)}`,
      referenceUrls: inputUrls,
      model: "openai/gpt-image-2",
      aspectRatio: "16:9",
      imageSize: "2K",
      quality: "medium",
      outputKind: "prop_ref",
    };
  },
};

export const renderRepairCandidateCapability: GenerationCapability = {
  id: "render_repair_candidate",
  name: "Render 修复候选",
  shortName: "Render修复",
  category: "beat",
  description: "修复当前 beat render / director render 候选图，满意后 Commit 到 beat slot。",
  outputKind: "director_render",
  model: "openai/gpt-image-2",
  aspectRatio: "16:9",
  imageSize: "2K",
  inputs: commonRefs(),
  params: [
    STYLE_PARAM,
    { key: "repair_focus", label: "修复重点", type: "text", defaultValue: "fix artifacts, faces, hands, props, background consistency" },
    { key: "notes", label: "补充要求", type: "text", defaultValue: "" },
  ],
  compose({ inputUrls, params, nodePrompt }) {
    const focus = stringifyParamValue(params.repair_focus);
    return {
      prompt: `Repair the current beat render candidate.

Focus: ${focus || "fix visual artifacts while preserving composition"}.${suffix(params, nodePrompt)}`,
      referenceUrls: inputUrls,
      model: "openai/gpt-image-2",
      aspectRatio: "16:9",
      imageSize: "2K",
      quality: "medium",
      outputKind: "director_render",
    };
  },
};

export const startFrameCandidateCapability: GenerationCapability = {
  id: "video_start_frame_candidate",
  name: "视频起手帧候选",
  shortName: "起手帧",
  category: "video",
  description: "从 render / 抽帧 / 参考图生成视频首帧候选，满意后 Commit 到 frame slot(视频起手帧 = beat 首帧,同一份文件)。",
  outputKind: "frame",
  model: "openai/gpt-image-2",
  aspectRatio: "16:9",
  imageSize: "2K",
  inputs: commonRefs(),
  params: [
    STYLE_PARAM,
    { key: "motion_setup", label: "运动起势", type: "text", defaultValue: "" },
    { key: "notes", label: "补充要求", type: "text", defaultValue: "" },
  ],
  compose({ inputUrls, params, nodePrompt }) {
    const motion = stringifyParamValue(params.motion_setup);
    return {
      prompt: `Create a clean video start-frame candidate for the current beat.

${motion ? `Motion setup to imply: ${motion}.` : "Preserve the beat composition and make it suitable for video generation."}${suffix(params, nodePrompt)}`,
      referenceUrls: inputUrls,
      model: "openai/gpt-image-2",
      aspectRatio: "16:9",
      imageSize: "2K",
      quality: "medium",
      outputKind: "frame",
    };
  },
};
