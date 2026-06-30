// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";

import { Sidebar } from "@/components/layout/sidebar";
import { useAppStore } from "@/stores/app-store";
import { useEpisodeWorkbenchStore } from "@/stores/episode-workbench-store";

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@/lib/queries/projects", () => ({
  useAllProjectSummaries: () => ({
    data: [
      {
        id: "proj-a",
        name: "Project A",
        status: "active",
        updatedAt: "2026-06-05T00:00:00Z",
        episodeCount: 3,
      },
    ],
    isLoading: false,
  }),
}));

const testI18n = i18n.createInstance();

beforeAll(async () => {
  await testI18n.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
    resources: {
      zh: {
        translation: {
          nav: {
            ingest: "导入",
            assets: "资产",
            episodes: "虾镜",
            freezone: "虾画",
            styles: "风格",
            tasks: "任务",
            aiAssistant: "虾导",
            switchProject: "切换项目",
            expandSidebar: "展开侧栏",
            collapseSidebar: "收起侧栏",
            collapse: "收起",
          },
          project: {
            create: "创建项目",
            dashboardTitle: "项目",
          },
        },
      },
    },
  });
});

function renderSidebarAt(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "projects/$project",
    component: () => (
      <>
        <Sidebar />
        <Outlet />
      </>
    ),
  });
  const freezoneRoute = createRoute({
    getParentRoute: () => projectRoute,
    path: "freezone",
    component: () => <div data-testid="freezone-route" />,
  });
  const episodesRoute = createRoute({
    getParentRoute: () => projectRoute,
    path: "episodes",
    component: () => <Outlet />,
  });
  const episodesIndexRoute = createRoute({
    getParentRoute: () => episodesRoute,
    path: "/",
    component: () => <div data-testid="episodes-route" />,
  });
  const episodeScriptRoute = createRoute({
    getParentRoute: () => episodesRoute,
    path: "$episode/script",
    component: () => <div data-testid="episode-script-route" />,
  });
  const routeTree = rootRoute.addChildren([
    projectRoute.addChildren([
      freezoneRoute,
      episodesRoute.addChildren([episodesIndexRoute, episodeScriptRoute]),
    ]),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    defaultPendingMs: 0,
  });

  const view = render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={testI18n}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <RouterProvider router={router as any} />
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return { ...view, router };
}

describe("Sidebar navigation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    useAppStore.setState({ sidebarCollapsed: false });
    useEpisodeWorkbenchStore.setState({
      lastEpisodeLocationByProject: {},
      beatSelectionByScope: {},
      actionPanelSectionsByScope: {},
      viewTogglesByScope: {},
    });
  });

  it("falls back to the episodes route when remembered episode state is polluted by a freezone URL", async () => {
    useEpisodeWorkbenchStore.setState({
      lastEpisodeLocationByProject: {
        "proj-a": "/projects/proj-a/freezone?canvas=beat-3",
      },
    });

    const { router } = renderSidebarAt("/projects/proj-a/freezone?canvas=beat-3");

    fireEvent.click(await screen.findByRole("link", { name: "虾镜" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/projects/proj-a/episodes"),
    );
    expect(router.state.location.searchStr).toBe("");
  });

  it("navigates to a remembered concrete episode route from freezone", async () => {
    useEpisodeWorkbenchStore.setState({
      lastEpisodeLocationByProject: {
        "proj-a": "/projects/proj-a/episodes/3/script?panel=sketch",
      },
    });

    const { router } = renderSidebarAt("/projects/proj-a/freezone?canvas=beat-3");

    fireEvent.click(await screen.findByRole("link", { name: "虾镜" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/projects/proj-a/episodes/3/script"),
    );
    expect(router.state.location.searchStr).toBe("?panel=sketch");
  });

  it("clears remembered episode route after the user returns to the episode list", async () => {
    useEpisodeWorkbenchStore.setState({
      lastEpisodeLocationByProject: {
        "proj-a": "/projects/proj-a/episodes/3/script?panel=sketch",
      },
    });

    const { router } = renderSidebarAt("/projects/proj-a/episodes");

    await waitFor(() =>
      expect(
        useEpisodeWorkbenchStore.getState().lastEpisodeLocationByProject["proj-a"],
      ).toBeUndefined(),
    );

    await router.navigate({ to: "/projects/$project/freezone", params: { project: "proj-a" } });
    fireEvent.click(await screen.findByRole("link", { name: "虾镜" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/projects/proj-a/episodes"),
    );
    expect(router.state.location.searchStr).toBe("");
  });
});
