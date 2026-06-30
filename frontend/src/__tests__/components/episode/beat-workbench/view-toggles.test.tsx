// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ViewToggles } from "@/components/episode/beat-workbench/view-toggles";

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
    resources: {
      zh: {
        translation: {
          episode: {
            beat: {
              sectionSketch: "草图",
              sectionRender: "渲染",
            },
            workbench: {
              view: {
                selectAll: "全选",
                selectedCount: "已选 {{count}}",
                clear: "清除",
                totalShots: "共{{count}}个镜头",
                activeBeat: "Beat {{n}}",
                selectionHint: "选择beat可进行草图、渲染图重抽",
                batchRegenSketch: "重抽草图",
                batchRegenRender: "重抽渲染图",
              },
            },
          },
        },
      },
    },
  });
});

describe("ViewToggles", () => {
  it("removes select all while keeping selected count and clear action", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onClearSelection = vi.fn();
    const onBatchRegenSketch = vi.fn();
    const onBatchRegenRender = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <ViewToggles
          toggles={new Set(["sketch", "render"])}
          onToggle={onToggle}
          selection={{ mode: "multi", checked: new Set([1]) }}
          totalBeats={3}
          onClearSelection={onClearSelection}
          onBatchRegenSketch={onBatchRegenSketch}
          onBatchRegenRender={onBatchRegenRender}
        />
      </I18nextProvider>,
    );

    expect(screen.queryByRole("button", { name: "全选" })).not.toBeInTheDocument();
    expect(screen.getByText("已选 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重抽草图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重抽渲染图" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重抽草图" }));
    await user.click(screen.getByRole("button", { name: "重抽渲染图" }));

    expect(onBatchRegenSketch).toHaveBeenCalledTimes(1);
    expect(onBatchRegenRender).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "清除" }));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("shows the selection hint when no beat is checked", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ViewToggles
          toggles={new Set(["sketch", "render"])}
          onToggle={vi.fn()}
          selection={{ mode: "none" }}
          totalBeats={3}
          onClearSelection={vi.fn()}
          onBatchRegenSketch={vi.fn()}
          onBatchRegenRender={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("选择beat可进行草图、渲染图重抽")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重抽草图" })).not.toBeInTheDocument();
  });

  it("keeps redraw actions hidden for single-beat selection", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ViewToggles
          toggles={new Set(["sketch", "render"])}
          onToggle={vi.fn()}
          selection={{ mode: "single", beatNum: 1 }}
          totalBeats={3}
          onClearSelection={vi.fn()}
          onBatchRegenSketch={vi.fn()}
          onBatchRegenRender={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("选择beat可进行草图、渲染图重抽")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重抽草图" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重抽渲染图" })).not.toBeInTheDocument();
  });
});
