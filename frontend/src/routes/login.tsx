// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, type UIEvent } from "react";
import { LoginStageContent } from "@/components/login/login-stage";
import { LoginModal } from "@/components/login/login-modal";
import { useAuthStore } from "@/stores/auth-store";
import { ensureAuthenticatedForAppRoute } from "@/lib/auth-mode";
import { clusterConfig } from "@/lib/cluster-config";
import { getRegionCookie } from "@/lib/region-cookie";
import { authRequired } from "@/lib/runtime-config";
import styles from "@/components/login/login.module.css";

function LoginPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [pageScrolled, setPageScrolled] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("preauth-shell");
    root.style.backgroundColor = "#181818";
    return () => {
      root.classList.remove("preauth-shell");
      root.style.backgroundColor = "";
    };
  }, []);

  const handlePageScroll = (event: UIEvent<HTMLElement>) => {
    setPageScrolled(event.currentTarget.scrollTop > 12);
  };

  return (
    <main
      className={`${styles.page} ${pageScrolled ? styles.pageScrolled : ""}`}
      onScroll={handlePageScroll}
    >
      <section className={styles.stage}>
        <LoginStageContent onStart={() => setLoginOpen(true)} />
      </section>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    // In multi-region mode, if region cookie is missing, stay on /login —
    // user must re-pick a region. Also clear the stale persisted username
    // so the picker can gate the submit button cleanly.
    if (clusterConfig.mode === "multi-region" && !getRegionCookie()) {
      useAuthStore.getState().reset();
      return;
    }

    if (!authRequired()) {
      throw redirect({ to: "/", replace: true });
    }
    if (!(await ensureAuthenticatedForAppRoute())) return; // stay on /login

    throw redirect({ to: "/", replace: true });
  },
  component: LoginPage,
});
