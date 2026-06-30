// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { GenerationCapability } from "./capabilityRegistry";
import { stringifyParamValue } from "./capabilityRegistry";

const PRESERVE_OPTIONS = [
  { value: "camera", label: "原始机位 / 构图" },
  { value: "layout", label: "桌椅 / 墙面 / 门窗位置" },
  { value: "identity", label: "人物身份颜色" },
  { value: "props", label: "道具颜色和位置" },
  { value: "street_mood", label: "市井氛围" },
];

const MODIFY_OPTIONS = [
  { value: "deblur", label: "修复模糊 / 糊成一片的背景" },
  { value: "distortion", label: "修复 3GS 畸变 / 拉伸" },
  { value: "furniture_detail", label: "补清桌椅结构" },
  { value: "actor_blocks", label: "方块人转干净角色线稿" },
  { value: "staging_blocks", label: "占位块转真实物体" },
];

function valuesToLabels(values: unknown, options: { value: string; label: string }[]): string {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const labels = raw
    .map((value) => options.find((option) => option.value === value)?.label ?? String(value))
    .filter(Boolean);
  return labels.length > 0 ? labels.join("；") : "保持当前画面核心结构";
}

function readBeatText(metadata: Record<string, unknown> | null | undefined): string {
  const beat = (metadata?.beat_context ?? {}) as Record<string, unknown>;
  const visual = typeof beat.visual_description === "string" ? beat.visual_description : "";
  const narration =
    typeof beat.narration_segment === "string" ? beat.narration_segment : "";
  const lines: string[] = [];
  if (visual.trim()) lines.push(`Beat visual description:\n${visual.trim()}`);
  if (narration.trim()) lines.push(`Narration context:\n${narration.trim()}`);
  return lines.join("\n\n");
}

export const realSceneSketchRepairCapability: GenerationCapability = {
  id: "real_scene_sketch_repair",
  name: "实景草图修复",
  shortName: "实景草图",
  category: "beat",
  description: "用导演世界 control frame 和场景/身份参考修复当前 beat 的实景草图。",
  outputKind: "sketch",
  model: "openai/gpt-image-2",
  aspectRatio: "16:9",
  imageSize: "2K",
  inputs: [
    {
      key: "3gs_combined",
      label: "3GS 导演合成图",
      required: true,
      acceptKinds: ["director", "sketch", "frame", "generic"],
      description: "第一张连入图会作为 base，控制机位、空间和构图。",
    },
    {
      key: "scene_refs",
      label: "场景/身份/道具参考",
      required: false,
      acceptKinds: ["scene", "identity", "portrait", "prop", "director", "generic"],
      description: "后续连入图作为修复和语义参考。",
    },
  ],
  params: [
    {
      key: "shot_type",
      label: "景别",
      type: "enum",
      defaultValue: "中景",
      options: [
        { value: "特写", label: "特写" },
        { value: "近景", label: "近景" },
        { value: "中景", label: "中景" },
        { value: "全景", label: "全景" },
      ],
    },
    {
      key: "angle",
      label: "角度",
      type: "enum",
      defaultValue: "平视",
      options: [
        { value: "平视", label: "平视" },
        { value: "俯拍", label: "俯拍" },
        { value: "仰拍", label: "仰拍" },
        { value: "过肩", label: "过肩" },
        { value: "反打", label: "反打" },
      ],
    },
    {
      key: "lens",
      label: "镜头",
      type: "enum",
      defaultValue: "35mm",
      options: [
        { value: "24mm", label: "24mm 广角" },
        { value: "35mm", label: "35mm 自然" },
        { value: "50mm", label: "50mm 标准" },
        { value: "85mm", label: "85mm 压缩" },
      ],
    },
    {
      key: "lighting",
      label: "光线",
      type: "enum",
      defaultValue: "昏暗市井暖光",
      options: [
        { value: "昏暗市井暖光", label: "昏暗市井暖光" },
        { value: "冷暖混合霓虹", label: "冷暖混合霓虹" },
        { value: "自然窗光", label: "自然窗光" },
        { value: "顶灯硬光", label: "顶灯硬光" },
      ],
    },
    {
      key: "preserve",
      label: "必须保持",
      type: "multiselect",
      defaultValue: ["camera", "layout", "identity", "props"],
      options: PRESERVE_OPTIONS,
    },
    {
      key: "modify",
      label: "重点修复",
      type: "multiselect",
      defaultValue: ["deblur", "distortion", "furniture_detail", "actor_blocks"],
      options: MODIFY_OPTIONS,
    },
    {
      key: "notes",
      label: "补充要求",
      type: "text",
      defaultValue: "",
      description: "例如：后排灰色人物也要上色，桌子必须保持木质结构。",
    },
  ],
  compose: ({ inputUrls, params, metadata, nodePrompt }) => {
    const beatText = readBeatText(metadata);
    const preserve = valuesToLabels(params.preserve, PRESERVE_OPTIONS);
    const modify = valuesToLabels(params.modify, MODIFY_OPTIONS);
    const notes = stringifyParamValue(params.notes);
    const shotType = stringifyParamValue(params.shot_type) || "中景";
    const angle = stringifyParamValue(params.angle) || "平视";
    const lens = stringifyParamValue(params.lens) || "35mm";
    const lighting = stringifyParamValue(params.lighting) || "昏暗市井暖光";

    const prompt = `Create a repaired real-scene storyboard sketch for the current SuperTale beat.

Camera parameters:
- shot size: ${shotType}
- angle: ${angle}
- lens language: ${lens}
- lighting: ${lighting}

Reference priority:
1. The first connected image is the exact 3GS combined/control frame. Preserve its camera, composition, lens feeling, spatial layout, and object placement.
2. Additional connected references provide scene cleanup, character identity, prop color, material, and semantic anchors.
3. Do not invent a new restaurant or move furniture. Repair what is already there.

Preserve:
${preserve}

Modify / repair:
${modify}

${beatText || "Beat visual description: use the current beat context if available."}
${nodePrompt?.trim() ? `\nNode context:\n${nodePrompt.trim()}` : ""}

Output requirements:
- Clean production storyboard sketch, real-scene based, 16:9.
- Keep the 3GS camera framing exactly; do not move tables, walls, doors, counters, windows, people, staging blocks, or viewpoint.
- Convert blocky 3GS actors into clean storyboard characters at the same approximate screen positions.
- Convert colored staging/prop blocks into the real intended objects while preserving assigned colors.
- Repair 3GS blur, smearing, floaters, warped furniture, and lens distortion.
- Background people should remain visible as simplified grey/neutral figures unless identity references say otherwise.
- No text labels, no subtitles, no UI, no watermark.
${notes ? `\nAdditional notes:\n${notes}` : ""}`;

    return {
      prompt,
      referenceUrls: inputUrls,
      model: "openai/gpt-image-2",
      aspectRatio: "16:9",
      imageSize: "2K",
      quality: "medium",
      outputKind: "sketch",
    };
  },
};
