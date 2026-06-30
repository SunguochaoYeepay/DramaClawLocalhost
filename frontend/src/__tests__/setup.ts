// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import "@testing-library/jest-dom/vitest";

// jsdom v29 + Node.js >=22 exposes a broken localStorage (plain object without
// Storage methods) when --localstorage-file is not set. Provide a spec-compliant
// in-memory replacement so zustand/persist and other code that relies on
// localStorage.setItem / getItem / removeItem works correctly in tests.
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.setItem !== "function") {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  Object.defineProperty(globalThis, "localStorage", { value: storage, writable: true, configurable: true });
  Object.defineProperty(window, "localStorage", { value: storage, writable: true, configurable: true });
}

import { server } from "@/__mocks__/msw/server";
import { beforeAll, afterAll, afterEach } from "vitest";

// `bypass` (not `error`): the repo has test files that own their own `setupServer`
// instance (e.g. render-plan.test.tsx). With two MSW instances listening, `error`
// from the global server would reject requests the test-local server would handle.
// `bypass` lets non-matching requests pass through to other interceptors or fail
// naturally, without MSW crying foul.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
