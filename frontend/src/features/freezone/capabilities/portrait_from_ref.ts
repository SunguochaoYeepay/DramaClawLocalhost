// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { GenerationCapability } from "./capabilityRegistry";
import { stringifyParamValue } from "./capabilityRegistry";

export const portraitFromRefCapability: GenerationCapability = {
  id: "portrait_from_ref",
  name: "从参考图生成角色身份",
  shortName: "角色身份",
  category: "character",
  description: "基于一张参考图生成角色 portrait / identity 候选，输出后再 Commit 到角色资产。",
  outputKind: "identity",
  model: "openai/gpt-image-2",
  aspectRatio: "3:4",
  imageSize: "2K",
  inputs: [
    {
      key: "ref_image",
      label: "参考图",
      required: true,
      acceptKinds: ["generic", "identity", "portrait", "render", "sketch"],
      description: "用于提取人物脸型、气质、服饰或姿态的参考图。",
    },
    {
      key: "identity_ref",
      label: "已有身份图",
      required: false,
      acceptKinds: ["identity", "portrait"],
      description: "如果是修改已有角色身份，可额外接入 canonical identity 作为一致性参考。",
    },
  ],
  params: [
    {
      key: "character",
      label: "角色",
      type: "text",
      defaultValue: "",
      description: "例如：杜晨。这里只用于生成提示词；写回目标在 Commit 时确认。",
    },
    {
      key: "age_band",
      label: "年龄阶段",
      type: "enum",
      defaultValue: "middle",
      options: [
        { value: "young", label: "青年" },
        { value: "middle", label: "中年" },
        { value: "old", label: "老年" },
      ],
    },
    {
      key: "portrait_style",
      label: "资产风格",
      type: "enum",
      defaultValue: "clean_production_portrait",
      options: [
        { value: "clean_production_portrait", label: "干净生产 portrait" },
        { value: "cinematic_identity", label: "影视身份照" },
        { value: "character_reference_sheet", label: "角色参考图" },
      ],
    },
    {
      key: "preserve",
      label: "保留",
      type: "multiselect",
      defaultValue: ["face", "hair", "temperament"],
      options: [
        { value: "face", label: "脸型五官" },
        { value: "hair", label: "发型" },
        { value: "temperament", label: "气质" },
        { value: "outfit", label: "服装方向" },
      ],
    },
    {
      key: "outfit",
      label: "服装补充",
      type: "text",
      defaultValue: "",
    },
    {
      key: "notes",
      label: "额外要求",
      type: "text",
      defaultValue: "",
    },
  ],
  compose({ inputUrls, params, nodePrompt }) {
    const character = stringifyParamValue(params.character) || "the target character";
    const ageBand = stringifyParamValue(params.age_band) || "middle";
    const style = stringifyParamValue(params.portrait_style) || "clean_production_portrait";
    const preserve = stringifyParamValue(params.preserve) || "face / temperament";
    const outfit = stringifyParamValue(params.outfit);
    const notes = stringifyParamValue(params.notes);

    const prompt = `Create a SuperTale character identity portrait candidate for ${character}.

Character phase:
- Age band: ${ageBand}.
- Asset style: ${style}.
- Preserve from references: ${preserve}.
${outfit ? `- Outfit direction: ${outfit}.` : ""}
${notes ? `- Extra requirements: ${notes}.` : ""}
${nodePrompt ? `\nNode note:\n${nodePrompt}` : ""}

Output requirements:
- Single clear character portrait, 3:4 aspect ratio.
- Keep face identity coherent and production-ready.
- No text, watermark, UI frame, or contact sheet.
- Clean background or simple cinematic background; do not create a busy scene.`;

    return {
      prompt,
      referenceUrls: inputUrls,
      model: "openai/gpt-image-2",
      aspectRatio: "3:4",
      imageSize: "2K",
      quality: "medium",
      outputKind: "identity",
    };
  },
};

export const characterMultiViewCapability: GenerationCapability = {
  id: "character_multi_view_candidate",
  name: "角色多视图生成",
  shortName: "角色多视图",
  category: "character",
  description: "基于角色图生成三视图/四视图/九宫格候选，满意后 Commit 到 identity 或 portrait 资产。",
  outputKind: "identity",
  model: "openai/gpt-image-2",
  aspectRatio: "16:9",
  imageSize: "2K",
  inputs: [
    {
      key: "character_ref",
      label: "角色参考图",
      required: true,
      acceptKinds: ["generic", "identity", "portrait", "render", "sketch"],
      description: "用于保持角色脸型、发型、服装和气质一致。",
    },
    {
      key: "style_ref",
      label: "风格/姿态参考",
      required: false,
      acceptKinds: ["generic", "identity", "portrait", "render", "sketch"],
      description: "可选，用于补充画风、姿态或服装细节。",
    },
  ],
  params: [
    {
      key: "character",
      label: "角色",
      type: "text",
      defaultValue: "",
      description: "例如：杜晨。",
    },
    {
      key: "layout",
      label: "布局",
      type: "enum",
      defaultValue: "four_view",
      options: [
        { value: "three_view", label: "三视图" },
        { value: "four_view", label: "四视图" },
        { value: "nine_grid", label: "九宫格" },
      ],
    },
    {
      key: "view_focus",
      label: "视图内容",
      type: "multiselect",
      defaultValue: ["front", "side", "back", "expression"],
      options: [
        { value: "front", label: "正面" },
        { value: "side", label: "侧面" },
        { value: "back", label: "背面" },
        { value: "expression", label: "表情" },
        { value: "pose", label: "动作姿态" },
        { value: "outfit", label: "服装细节" },
      ],
    },
    {
      key: "notes",
      label: "额外要求",
      type: "text",
      defaultValue: "",
    },
  ],
  compose({ inputUrls, params, nodePrompt }) {
    const character = stringifyParamValue(params.character) || "the target character";
    const layout = stringifyParamValue(params.layout) || "four_view";
    const viewFocus = stringifyParamValue(params.view_focus) || "front / side / back / expression";
    const notes = stringifyParamValue(params.notes);

    const layoutText =
      layout === "three_view"
        ? "a clean 3-view character reference sheet: front, side, back"
        : layout === "nine_grid"
          ? "a 3x3 character reference grid with consistent identity across expressions and poses"
          : "a clean 4-view character reference sheet: front, side, back, and expression/detail view";

    const prompt = `Create ${layoutText} for ${character}.

View focus: ${viewFocus}.
${notes ? `Extra requirements: ${notes}.` : ""}
${nodePrompt ? `\nNode note:\n${nodePrompt}` : ""}

Output requirements:
- Keep the same face identity, age, hairstyle, body proportion, outfit palette, and production style across all cells.
- Use a clean, readable contact-sheet layout suitable for SuperTale character assets.
- No text labels, watermark, UI frame, or unrelated background scene.
- If references conflict, prioritize the first reference image as identity source.`;

    return {
      prompt,
      referenceUrls: inputUrls,
      model: "openai/gpt-image-2",
      aspectRatio: "16:9",
      imageSize: "2K",
      quality: "medium",
      outputKind: "identity",
    };
  },
};
