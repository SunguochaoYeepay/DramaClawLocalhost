// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import ky from "ky";
import type { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useRegionStore } from "@/stores/region-store";
import { tryAcquireNavLock } from "@/lib/nav-lock";
import { regionAbortController } from "@/lib/region-abort";
import { clearRegionCookie } from "@/lib/region-cookie";
import { resetRegionState } from "@/lib/reset-region-state";

// Module-level QueryClient handle so the afterResponse hook can do the full
// cross-store + query-cache purge on a 400 no_region. Wired from main.tsx
// immediately after the QueryClient is constructed.
let _queryClient: QueryClient | null = null;
export function setApiQueryClient(qc: QueryClient): void {
  _queryClient = qc;
}

// Why `credentials: "include"`? The SPA authenticates via an HttpOnly cookie
// (`st_session`) set by `POST /api/v1/auth/login`. The browser will only
// attach that cookie to same-origin fetches automatically; we set it
// explicitly so it also flows through the Vite dev proxy and the production
// edge reverse-proxy with no surprises. Business APIs no longer accept
// long-lived API keys; browser traffic is cookie-backed.
export const api = ky.create({
  prefix: "/",
  credentials: "include",
  // Default request timeout. Long-running operations (AI detection, identity
  // planning, image generation) override this per-request with a larger value.
  timeout: 30_000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        // Attach the shared region-abort signal so a region switch can
        // cancel every in-flight ky call. In mode:"none" the controller
        // is never aborted, so this is a no-op for existing deployments.
        // Combine with the existing request.signal (ky's timeout signal
        // AND any caller-supplied signal) so we don't clobber either.
        const regionSignal = regionAbortController().signal;
        const callerSignal = request.signal;
        const signals: AbortSignal[] = [regionSignal];
        if (callerSignal) signals.push(callerSignal);

        let combined: AbortSignal;
        if (typeof (AbortSignal as unknown as { any?: unknown }).any === "function") {
          combined = (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(
            signals,
          );
        } else {
          // No AbortSignal.any — preserve ky's timeout / caller signal. Very old browsers
          // lose the abort-on-region-switch capability; acceptable.
          combined = callerSignal ?? regionSignal;
        }
        return new Request(request, { signal: combined });
      },
    ],
    afterResponse: [
      async ({ response }) => {
        if (response.status === 400) {
          // Edge dispatcher returns 400 { ok: false, error: "no_region" } when the
          // server-region cookie is missing or points at a decommissioned region.
          // Clear the region cookie + store and hard-redirect to /login so the
          // user can pick a live region again. Generic 400s (validation, etc.)
          // must remain transparent — we only act on error=no_region.
          const body = await response
            .clone()
            .json()
            .catch(() => null);
          if (
            body &&
            typeof body === "object" &&
            (body as { error?: unknown }).error === "no_region"
          ) {
            if (!tryAcquireNavLock()) return;
            // Full purge: auth store, cross-domain Zustand stores, query
            // cache, localStorage region sweep, region store, and cookie.
            // Without the resetRegionState branch we leave episode-scoped
            // caches, seen-pools, and task-center data behind — which can
            // bleed into the next region's session after re-login.
            await useAuthStore.getState().logout().catch(() => undefined);
            if (_queryClient) {
              resetRegionState({ queryClient: _queryClient });
            }
            useRegionStore.getState().clearRegion();
            clearRegionCookie();
            if (typeof window !== "undefined") {
              window.location.href = "/login";
            }
            return;
          }
          return;
        }
        if (response.status === 401) {
          if (typeof window !== "undefined" && window.location.pathname === "/login") return;
          if (!tryAcquireNavLock()) return;
          await useAuthStore.getState().logout();
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
        }
      },
    ],
  },
});
