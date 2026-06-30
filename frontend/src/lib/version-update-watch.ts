// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { markUpdateAvailable } from "@/lib/app-update-available";
import { APP_VERSION } from "@/lib/app-version";

// Poll a tiny build-emitted manifest (/version.json) and compare the deployed
// version against APP_VERSION — the compile-time constant baked into THIS
// running bundle (see the emit-version-json plugin in vite.config.ts). Because
// the baseline is the running code's own version (not a fetched-then-remembered
// value), there is no seed race: a deploy that lands between page load and the
// first poll is still caught. It's also independent of the backend, so CDN-only
// frontend deploys are detected even when the API never restarts.
const POLL_INTERVAL_MS = 120_000;

export function deployedVersionDiffers(
  deployed: string | null,
  running: string,
): boolean {
  return deployed !== null && deployed !== running;
}

async function fetchDeployedVersion(): Promise<string | null> {
  try {
    // Cache-bust + no-store so a CDN/proxy can't hand back a stale manifest.
    const response = await fetch(`/version.json?_v=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const version = (data as { version?: unknown } | null)?.version;
    return typeof version === "string" && version.length > 0 ? version : null;
  } catch {
    return null;
  }
}

export function installVersionUpdateWatch(): () => void {
  if (typeof window === "undefined") return () => undefined;
  // Only meaningful against a built bundle whose APP_VERSION pairs with a
  // deployed version.json. The dev server has neither and handles updates via
  // HMR, so there is nothing to watch.
  if (!import.meta.env.PROD) return () => undefined;

  let stopped = false;
  let inFlight = false;
  let intervalId = 0;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisible);
  };

  const check = async (): Promise<void> => {
    // Skip while hidden: a backgrounded tab left open for hours shouldn't keep
    // hitting the origin. onVisible re-checks promptly the moment it refocuses.
    if (inFlight || stopped || document.visibilityState !== "visible") return;
    inFlight = true;
    const deployed = await fetchDeployedVersion();
    inFlight = false;
    if (stopped) return;
    if (deployedVersionDiffers(deployed, APP_VERSION)) {
      markUpdateAvailable();
      // The signal is sticky; no reason to keep polling once we've nudged.
      stop();
    }
  };

  const onVisible = (): void => {
    if (document.visibilityState === "visible") void check();
  };

  // Check once now, then poll while visible and re-check on refocus (covers the
  // common "left it open overnight, came back" case promptly).
  void check();
  intervalId = window.setInterval(() => void check(), POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisible);

  return stop;
}
