// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
/**
 * Build-time app version, injected by Vite's `define` (see vite.config.ts).
 *
 * Source precedence:
 *   1. $VITE_APP_VERSION in the build environment (set by CI from the git tag
 *      on tag/dispatch builds, or `dev-<sha>` on main-push dev builds).
 *   2. `git describe --tags --always --dirty` (local dev fallback).
 *   3. `unknown` (last resort — repo missing git, etc.).
 */
declare const __APP_VERSION__: string;

export const APP_VERSION: string = __APP_VERSION__;
