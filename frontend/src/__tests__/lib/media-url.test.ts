// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { describe, it, expect } from "vitest";
import { resolveMediaUrl } from "@/lib/media-url";

describe("resolveMediaUrl", () => {
  it("returns null for null input", () => {
    expect(resolveMediaUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(resolveMediaUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveMediaUrl("")).toBeNull();
  });

  it("routes project /static/ media through the protected project static URL", () => {
    window.history.pushState(null, "", "/");
    expect(resolveMediaUrl("/static/admin/proj/sketches/img.png?v=123")).toBe(
      "/static/projects/proj/sketches/img.png?v=123",
    );
  });

  it("preserves canonical protected project static URLs", () => {
    expect(resolveMediaUrl("/static/projects/proj/sketches/img.png?v=123")).toBe(
      "/static/projects/proj/sketches/img.png?v=123",
    );
  });

  it("uses the current route project id instead of the legacy static project path", () => {
    window.history.pushState(null, "", "/projects/01KS77361FXAQNKQF2W4EWWVCW/characters");
    expect(
      resolveMediaUrl(
        "/static/admin/xuanchuanpian/assets/characters/%E9%9D%A2%E9%A6%86%E7%94%B7%E9%9D%92%E5%B9%B4/portrait.png?v=123",
      ),
    ).toBe(
      "/static/projects/01KS77361FXAQNKQF2W4EWWVCW/assets/characters/%E9%9D%A2%E9%A6%86%E7%94%B7%E9%9D%92%E5%B9%B4/portrait.png?v=123",
    );
  });

  it("uses the freezone query project id instead of the legacy static project path", () => {
    window.history.pushState(null, "", "/freezone/?p=01KS77361FXAQNKQF2W4EWWVCW");
    expect(
      resolveMediaUrl(
        "/static/admin/xuanchuanpian/assets/scenes/%E5%85%B0%E5%B7%9E%E6%8B%89%E9%9D%A2%E9%A6%86/master.png?v=123",
      ),
    ).toBe(
      "/static/projects/01KS77361FXAQNKQF2W4EWWVCW/assets/scenes/%E5%85%B0%E5%B7%9E%E6%8B%89%E9%9D%A2%E9%A6%86/master.png?v=123",
    );
  });

  it("preserves non-project /static/ paths", () => {
    expect(resolveMediaUrl("/static/style-examples/demo.png")).toBe(
      "/static/style-examples/demo.png",
    );
  });

  it("preserves legacy project-only /static/ paths", () => {
    expect(resolveMediaUrl("/static/demo/assets/narrator/voice.wav")).toBe(
      "/static/demo/assets/narrator/voice.wav",
    );
  });

  it("canonicalizes project media API URLs to protected static URLs for the current project", () => {
    window.history.pushState(null, "", "/projects/01KS77361FXAQNKQF2W4EWWVCW/assets");
    expect(
      resolveMediaUrl(
        "/api/v1/projects/xuanchuanpian/media/assets/scenes/%E5%85%B0%E5%B7%9E%E6%8B%89%E9%9D%A2%E9%A6%86/reverse_master.png?v=123",
      ),
    ).toBe(
      "/static/projects/01KS77361FXAQNKQF2W4EWWVCW/assets/scenes/%E5%85%B0%E5%B7%9E%E6%8B%89%E9%9D%A2%E9%A6%86/reverse_master.png?v=123",
    );
  });

  it("canonicalizes same-origin absolute project media API URLs", () => {
    window.history.pushState(null, "", "/projects/01KS77361FXAQNKQF2W4EWWVCW/assets");
    expect(
      resolveMediaUrl(
        `${window.location.origin}/api/v1/projects/xuanchuanpian/media/assets/scenes/hall/reverse_master.png?v=123`,
      ),
    ).toBe(
      "/static/projects/01KS77361FXAQNKQF2W4EWWVCW/assets/scenes/hall/reverse_master.png?v=123",
    );
  });

  it("passes through absolute /api/ paths", () => {
    expect(resolveMediaUrl("/api/v1/projects/x/y")).toBe(
      "/api/v1/projects/x/y",
    );
  });

  it("rejects javascript: URLs", () => {
    expect(resolveMediaUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: URLs", () => {
    expect(resolveMediaUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects vbscript: URLs", () => {
    expect(resolveMediaUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects protocol-relative URLs", () => {
    expect(resolveMediaUrl("//evil.example.com/x.png")).toBeNull();
  });

  it("rejects cross-origin absolute URLs", () => {
    expect(resolveMediaUrl("http://example.com/img.png")).toBeNull();
    expect(resolveMediaUrl("https://evil.example.com/img.png")).toBeNull();
  });
});
