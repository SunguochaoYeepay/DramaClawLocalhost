// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { ComponentType } from "react";

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({ isCeRuntime: true }));
const toastErrorMock = vi.hoisted(() => vi.fn());
const mutation = vi.hoisted(() => () => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => runtimeState.isCeRuntime,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useParams: () => ({ project: "demo" }),
  }),
}));

vi.mock("@/lib/queries/styles", () => ({
  useStyles: () => ({
    isLoading: false,
    isRefetching: false,
    refetch: vi.fn(),
    data: {
      ok: true,
      data: [
        {
          id: "ink",
          name: "Ink",
          label: "Ink style",
          type: "preset",
        },
      ],
    },
  }),
  useStyleDetail: () => ({
    isFetching: false,
    data: {
      ok: true,
      data: {
        id: "ink",
        name: "Ink",
        label: "Ink style",
        type: "preset",
        style_instructions: "clean ink lines",
        avoid_instructions: "muddy colors",
        style_tag: "ink",
      },
    },
  }),
  useCreateStyle: mutation,
  useDeleteStyle: mutation,
  useAnalyzeStyle: mutation,
}));

vi.mock("@/lib/queries/projects", () => ({
  useProject: () => ({ data: { ok: true, data: { visual_style: "ink" } } }),
  useUpdateProject: mutation,
}));

import { Route } from "@/routes/_app/projects.$project/styles";

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          nav: { styles: "Styles" },
          common: {
            refresh: "Refresh",
            refreshed: "Refreshed",
            loading: "Loading",
            save: "Save",
            cancel: "Cancel",
            error: "Error",
          },
          styles: {
            selectStyleHint: "Select a style.",
            createStyle: "Create style",
            projectDefault: "Project default",
            preset: "Preset",
            custom: "Custom",
            customPreviewUnavailable: "No preview",
            customPreviewHint: "Upload a preview.",
            labelField: "Label",
            labelPlaceholder: "Label",
            projectStyleSection: "Project style",
            styleDirective: "Style directive",
            avoidDirective: "Avoid directive",
            styleTag: "Style tag",
            styleTagHint: "Short tag",
            styleTagPlaceholder: "tag",
            jsonEdit: "JSON",
            save: "Save",
            alreadyDefault: "Already default",
            applyToProject: "Apply to project",
            delete: "Delete",
            createTitle: "Create style",
            createHint: "Create a new style.",
            styleId: "Style ID",
            nameField: "Name",
            namePlaceholder: "Name",
            aiAnalyze: "AI analyze",
            uploadRef: "Upload ref",
            reupload: "Reupload",
          },
        },
      },
    },
  });
});

function classNameContains(container: HTMLElement, token: string) {
  return Array.from(container.querySelectorAll("*")).some((node) =>
    String(node.getAttribute("class") ?? "").includes(token),
  );
}

describe("styles page CE generation credit gating", () => {
  beforeEach(() => {
    runtimeState.isCeRuntime = true;
    toastErrorMock.mockClear();
  });

  it("renders style controls without credit UI, credit styling, or credit errors", async () => {
    const Component = Route.options.component as ComponentType;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <Component />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Ink style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create style" })).toBeInTheDocument();

    expect(screen.queryByText(/credits?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/积分|额度/)).not.toBeInTheDocument();
    expect(classNameContains(container, "#007A87")).toBe(false);
    expect(toastErrorMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/积分不足|credit|insufficient/i),
    );
  });
});
