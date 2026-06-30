// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("audio IndexTTS2 alignment contract", () => {
  it("does not expose legacy TTS voices, preview, or tts/generate calls in active FE code", () => {
    const audioQueries = read("src/lib/queries/audio.ts");
    const audioPane = read("src/components/episode/beat-workbench/audio-pane.tsx");

    expect(audioQueries).not.toContain("/tts/voices");
    expect(audioQueries).not.toContain("/tts/preview");
    expect(audioQueries).not.toContain("/tts/generate");
    expect(audioPane).not.toContain("useTTSVoices");
    expect(audioPane).not.toContain("usePreviewTTS");
  });

  it("uses audio_generation_indextts2 as the active audio task type", () => {
    const taskTypes = read("src/lib/task-types.ts");
    const stageRegistry = read("src/lib/episode-stage-registry.ts");
    const batchBar = read("src/components/episode/beat-workbench/batch-bar.tsx");
    const batchPanel = read("src/components/episode/beat-workbench/batch-panel.tsx");

    expect(taskTypes).toContain(
      'AUDIO_GENERATION_INDEXTTS2: "audio_generation_indextts2"',
    );
    expect(stageRegistry).toContain("TASK_TYPES.AUDIO_GENERATION_INDEXTTS2");
    expect(batchBar).toContain("TASK_TYPES.AUDIO_GENERATION_INDEXTTS2");
    expect(batchPanel).toContain("TASK_TYPES.AUDIO_GENERATION_INDEXTTS2");
  });

  it("dispatches selected beat audio as one async task instead of patching audio_url synchronously", () => {
    const audioQueries = read("src/lib/queries/audio.ts");
    const batchPanel = read("src/components/episode/beat-workbench/batch-panel.tsx");
    const audioHandler = batchPanel.match(
      /const handleBatchAudio = async \(\) => \{[\s\S]*?\n  \};/,
    )?.[0] ?? "";

    expect(audioQueries).not.toContain("audio_url");
    expect(audioHandler).not.toContain("let ok = 0");
    expect(audioHandler).not.toContain("for (const beatNum of beatList)");
    expect(audioHandler).toContain("beatNumbers: beatList");
  });
});
