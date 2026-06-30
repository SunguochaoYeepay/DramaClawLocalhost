// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreditCostInline } from "@/components/credit-cost-inline";

const runtimeState = vi.hoisted(() => ({ isCeRuntime: false }));

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => runtimeState.isCeRuntime,
}));

describe("CreditCostInline CE gating", () => {
  beforeEach(() => {
    runtimeState.isCeRuntime = false;
  });

  it("renders generation cost in EE runtime", () => {
    render(<CreditCostInline display="12" />);

    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders nothing in CE runtime", () => {
    runtimeState.isCeRuntime = true;

    const { container } = render(<CreditCostInline display="12" />);

    expect(screen.queryByText("12")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
