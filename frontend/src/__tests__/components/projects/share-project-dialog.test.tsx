// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShareProjectDialog } from "@/components/projects/share-project-dialog";
import type { ProjectSummary } from "@/types/project";

const runtimeState = vi.hoisted(() => ({ isCeRuntime: false }));

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => runtimeState.isCeRuntime,
}));

vi.mock("@/lib/queries/projects", () => ({
  useProjectGrants: () => ({ data: { data: [] } }),
  useUserSearch: () => ({ data: { data: [] } }),
  useAddProjectGrant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProjectGrant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteProjectGrant: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const project = {
  id: "p1",
  name: "Demo",
  ownerUsername: "alice",
  effectiveRole: "owner",
} as ProjectSummary;

function renderDialog() {
  return render(
    <ShareProjectDialog project={project} open onOpenChange={() => {}} />,
  );
}

describe("ShareProjectDialog (edition gating)", () => {
  beforeEach(() => {
    runtimeState.isCeRuntime = false;
  });

  it("renders the share dialog in EE runtime", () => {
    renderDialog();
    expect(screen.getByText("共享项目")).toBeInTheDocument();
  });

  it("renders nothing in CE runtime", () => {
    runtimeState.isCeRuntime = true;
    const { container } = renderDialog();
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("共享项目")).not.toBeInTheDocument();
  });
});
