// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
export type CharacterMainCopy = {
  label: string;
  makeMain: string;
  unsetMain: string;
  mainSet: string;
  mainUnset: string;
};

const DRAMA_MAIN_COPY: CharacterMainCopy = {
  label: "主角",
  makeMain: "设为主角",
  unsetMain: "取消主角",
  mainSet: "已设为主角",
  mainUnset: "已取消主角",
};

const NARRATED_MAIN_COPY: CharacterMainCopy = {
  label: "解说主角",
  makeMain: "设为解说主角",
  unsetMain: "取消解说主角",
  mainSet: "已设为解说主角",
  mainUnset: "已取消解说主角",
};

export function characterMainCopyForSpineTemplate(
  spineTemplate: string | null | undefined,
): CharacterMainCopy {
  return spineTemplate === "narrated" ? NARRATED_MAIN_COPY : DRAMA_MAIN_COPY;
}
