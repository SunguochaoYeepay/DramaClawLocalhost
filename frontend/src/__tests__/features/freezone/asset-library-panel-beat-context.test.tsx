// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listFreezoneBeatContext = vi.fn();
const listFreezoneProjectAssets = vi.fn();

vi.mock("@/api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/projects")>()),
  listFreezoneBeatContext: (...args: unknown[]) => listFreezoneBeatContext(...args),
  listFreezoneProjectAssets: (...args: unknown[]) => listFreezoneProjectAssets(...args),
}));

vi.mock("@/features/freezone/CanvasesTab", () => ({
  CanvasesTab: () => null,
}));

import { AssetLibraryPanel } from "@/features/freezone/AssetLibraryPanel";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("AssetLibraryPanel beat context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares one project asset request across matching panels", async () => {
    listFreezoneProjectAssets.mockResolvedValue([]);
    listFreezoneBeatContext.mockResolvedValue({
      scope: { episode: null, beat: null },
      episodes: [],
      assets: [],
    });

    render(
      <>
        <AssetLibraryPanel
          project="demo"
          metadata={{ kind: "default" }}
          currentCanvasId="user_admin_demo"
        />
        <AssetLibraryPanel
          project="demo"
          metadata={{ kind: "default" }}
          currentCanvasId="user_admin_demo"
        />
      </>,
      { wrapper: makeWrapper() },
    );

    await vi.waitFor(() => expect(listFreezoneProjectAssets).toHaveBeenCalledTimes(1));
  });

  it("refetches shared beat context when the asset reload token changes", async () => {
    listFreezoneProjectAssets.mockResolvedValue([]);
    listFreezoneBeatContext.mockResolvedValue({
      scope: { episode: null, beat: null },
      episodes: [],
      assets: [],
    });

    const { rerender } = render(
      <AssetLibraryPanel
        project="demo"
        metadata={{ kind: "default" }}
        currentCanvasId="user_admin_demo"
        reloadToken={0}
      />,
      { wrapper: makeWrapper() },
    );

    await vi.waitFor(() => expect(listFreezoneBeatContext).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      rerender(
        <AssetLibraryPanel
          project="demo"
          metadata={{ kind: "default" }}
          currentCanvasId="user_admin_demo"
          reloadToken={1}
        />,
      );
    });

    await vi.waitFor(() => expect(listFreezoneBeatContext).toHaveBeenCalledTimes(2));
  });

  it("clears the project asset error after a successful refetch", async () => {
    listFreezoneProjectAssets
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce([]);
    listFreezoneBeatContext.mockResolvedValue({
      scope: { episode: null, beat: null },
      episodes: [],
      assets: [],
    });

    const { rerender } = render(
      <AssetLibraryPanel
        project="demo"
        metadata={{ kind: "default" }}
        currentCanvasId="user_admin_demo"
        reloadToken={0}
        collapsed={false}
      />,
      { wrapper: makeWrapper() },
    );

    fireEvent.click(screen.getByRole("button", { name: "主线资产" }));
    await screen.findByText(/项目素材加载失败：network down/);

    act(() => {
      rerender(
        <AssetLibraryPanel
          project="demo"
          metadata={{ kind: "default" }}
          currentCanvasId="user_admin_demo"
          reloadToken={1}
          collapsed={false}
        />,
      );
    });

    await vi.waitFor(() => expect(listFreezoneProjectAssets).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      expect(screen.queryByText(/项目素材加载失败/)).toBeNull();
    });
  });

  it("keeps beat director outputs out of the scene asset tab", async () => {
    listFreezoneProjectAssets.mockResolvedValue([
      {
        id: "beat-1-director",
        tab: "director",
        kind: "director",
        role: "director_combined",
        label: "导演合成图",
        sublabel: "EP1 / Beat 1",
        url: "/static/director_control_frames/ep001/beat_01/combined.png",
        rel_path: "director_control_frames/ep001/beat_01/combined.png",
        media_type: "image",
        exists: true,
        meta: { episode: 1, beat: 1 },
      },
      {
        id: "beat-1-background",
        tab: "director",
        kind: "director",
        role: "selected_background",
        label: "当前背景 · Beat 1",
        sublabel: "EP1 / Beat 1",
        url: "/static/director_control_frames/ep001/beat_01/selected_background.png",
        rel_path: "director_control_frames/ep001/beat_01/selected_background.png",
        media_type: "image",
        exists: true,
        meta: { episode: 1, beat: 1 },
      },
      {
        id: "scene-master-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_master",
        label: "厨房",
        sublabel: "scene master",
        url: "/static/assets/scenes/kitchen/master.png",
        rel_path: "assets/scenes/kitchen/master.png",
        media_type: "image",
        exists: true,
        meta: { scene_id: "厨房" },
      },
    ]);
    listFreezoneBeatContext.mockResolvedValue({
      scope: { episode: null, beat: null },
      episodes: [],
      assets: [],
    });

    render(
      <AssetLibraryPanel
        project="demo"
        metadata={{ kind: "default" }}
        currentCanvasId="user_admin_demo"
        collapsed={false}
      />,
      { wrapper: makeWrapper() },
    );

    fireEvent.click(screen.getByRole("button", { name: "主线资产" }));
    fireEvent.click(screen.getByRole("button", { name: /场景/ }));
    expect(await screen.findByText("厨房")).toBeInTheDocument();
    expect(screen.queryByText("导演合成图")).toBeNull();
    expect(screen.queryByText("当前背景 · Beat 1")).toBeNull();
  });

  it("keeps concrete scene slots and hides auxiliary scene pointers", async () => {
    listFreezoneProjectAssets.mockResolvedValue([
      {
        id: "scene-master-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_master",
        label: "厨房 / master",
        sublabel: "厨房",
        url: "/static/assets/scenes/kitchen/master.png",
        rel_path: "assets/scenes/kitchen/master.png",
        media_type: "image",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-reverse-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_reverse_master",
        label: "厨房 / reverse master",
        sublabel: "厨房",
        url: "/static/assets/scenes/kitchen/reverse_master.png",
        rel_path: "assets/scenes/kitchen/reverse_master.png",
        media_type: "image",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-deprecated-360-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_360",
        label: "厨房 / 旧 360",
        sublabel: "厨房",
        url: "/static/assets/scenes/kitchen/scene_panorama_sketch_360.png",
        rel_path: "assets/scenes/kitchen/scene_panorama_sketch_360.png",
        media_type: "image",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-director-pano-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_director_pano_360",
        label: "厨房 / director pano 360",
        sublabel: "厨房",
        url: "/static/director_worlds/kitchen/v1/pano_360.png",
        rel_path: "director_worlds/kitchen/v1/pano_360.png",
        media_type: "image",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-3gs-master-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_3gs_master_ply",
        label: "厨房 / 3D 世界（正面）",
        sublabel: "厨房",
        url: "/static/assets/scenes/kitchen/3dgs/master.sog",
        rel_path: "assets/scenes/kitchen/3dgs/master.sog",
        media_type: "file",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-3gs-reverse-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_3gs_reverse_ply",
        label: "厨房 / 3D 世界（背面）",
        sublabel: "厨房",
        url: "/static/assets/scenes/kitchen/3dgs/reverse.sog",
        rel_path: "assets/scenes/kitchen/3dgs/reverse.sog",
        media_type: "file",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-3gs-pano-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_3gs_pano_ply",
        label: "厨房 / 3D 世界（360）",
        sublabel: "厨房",
        url: "/static/assets/scenes/kitchen/3dgs/pano.sog",
        rel_path: "assets/scenes/kitchen/3dgs/pano.sog",
        media_type: "file",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-3gs-active-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_3gs_active_ply",
        label: "厨房 / 3D 世界（当前）",
        sublabel: "厨房",
        url: "/static/assets/scenes/kitchen/3dgs/active.sog",
        rel_path: "assets/scenes/kitchen/3dgs/active.sog",
        media_type: "file",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-3gs-collision-kitchen",
        tab: "scenes",
        kind: "scene",
        role: "scene_3gs_collision_glb",
        label: "厨房 / 3D 碰撞体",
        sublabel: "厨房",
        url: "/static/assets/scenes/kitchen/3dgs/collision.glb",
        rel_path: "assets/scenes/kitchen/3dgs/collision.glb",
        media_type: "file",
        exists: true,
        meta: { scene_id: "厨房" },
      },
      {
        id: "scene-master-bedroom",
        tab: "scenes",
        kind: "scene",
        role: "scene_master",
        label: "卧室 / master",
        sublabel: "卧室",
        url: "/static/assets/scenes/bedroom/master.png",
        rel_path: "assets/scenes/bedroom/master.png",
        media_type: "image",
        exists: true,
        meta: { scene_id: "卧室" },
      },
    ]);
    listFreezoneBeatContext.mockResolvedValue({
      scope: { episode: null, beat: null },
      episodes: [],
      assets: [],
    });

    render(
      <AssetLibraryPanel
        project="demo"
        metadata={{ kind: "default" }}
        currentCanvasId="user_admin_demo"
        collapsed={false}
      />,
      { wrapper: makeWrapper() },
    );

    fireEvent.click(screen.getByRole("button", { name: "主线资产" }));
    fireEvent.click(screen.getByRole("button", { name: /场景/ }));

    expect(await screen.findByText("厨房 / master")).toBeInTheDocument();
    expect(screen.getByText("厨房 / reverse master")).toBeInTheDocument();
    expect(screen.getByText("厨房 / 导演世界")).toBeInTheDocument();
    expect(screen.getByText("卧室 / master")).toBeInTheDocument();
    expect(screen.queryByText("厨房 / 旧 360")).toBeNull();
    expect(screen.queryByText("厨房 / director pano 360")).toBeNull();
    expect(screen.queryByText("厨房 / 3D 世界（正面）")).toBeNull();
    expect(screen.queryByText("厨房 / 3D 世界（背面）")).toBeNull();
    expect(screen.queryByText("厨房 / 3D 世界（360）")).toBeNull();
    expect(screen.queryByText("厨房 / 3D 世界（当前）")).toBeNull();
    expect(screen.queryByText("厨房 / 3D 碰撞体")).toBeNull();
    expect(screen.getAllByText("正面图")).toHaveLength(2);
    expect(screen.getAllByText("背面图")).toHaveLength(1);
    expect(screen.getAllByText("导演世界")).toHaveLength(1);
    expect(screen.queryByText("360图")).toBeNull();
    expect(screen.queryByText("正面世界")).toBeNull();
    expect(screen.queryByText("背面世界")).toBeNull();
    expect(screen.queryByText("360世界")).toBeNull();
    expect(screen.getByRole("button", { name: /场景.*4/ })).toBeInTheDocument();
  });
});
