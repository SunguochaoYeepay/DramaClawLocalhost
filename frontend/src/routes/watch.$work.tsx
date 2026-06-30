// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { LoginModal } from "@/components/login/login-modal";
import { loginCommunityWorks } from "@/lib/login-community";
import styles from "@/components/login/login.module.css";

const WATCH_RAIL_REPEAT_COUNT = 1;
const WATCH_RAIL_CANONICAL_GROUP_INDEX = 0;
const WATCH_RAIL_DRAG_THRESHOLD_PX = 8;
const watchRailEntries = Array.from({ length: WATCH_RAIL_REPEAT_COUNT }, (_, groupIndex) =>
  loginCommunityWorks.map((work) => ({
    railId: groupIndex === WATCH_RAIL_CANONICAL_GROUP_INDEX ? work.id : `${work.id}-rail-${groupIndex}`,
    work,
  })),
).flat();

function findWatchRailEntry(id: string) {
  return watchRailEntries.find((entry) => entry.railId === id);
}

function WatchPage() {
  const { work: workId } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [selectedRailId, setSelectedRailId] = useState(workId);
  const activeEntry = findWatchRailEntry(selectedRailId) ?? findWatchRailEntry(workId);
  const activeWork = activeEntry?.work;
  const [loginOpen, setLoginOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    const video = stageVideoRef.current;
    if (video) {
      video.muted = !next;
      // Unmuting happens inside a click handler, so the browser allows audio.
      void video.play().catch(() => {});
    }
  };
  const railRef = useRef<HTMLElement | null>(null);
  const activeRailItemRef = useRef<HTMLButtonElement | null>(null);
  const stageVideoRef = useRef<HTMLVideoElement | null>(null);
  const railDragRef = useRef({
    isDragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
  });
  const activeIndex = activeEntry
    ? watchRailEntries.findIndex((entry) => entry.railId === activeEntry.railId)
    : -1;
  const previousWork =
    activeIndex >= 0
      ? watchRailEntries[(activeIndex - 1 + watchRailEntries.length) % watchRailEntries.length]
      : null;
  const nextWork =
    activeIndex >= 0 ? watchRailEntries[(activeIndex + 1) % watchRailEntries.length] : null;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("preauth-shell");
    root.style.backgroundColor = "#181818";
    return () => {
      root.classList.remove("preauth-shell");
      root.style.backgroundColor = "";
    };
  }, []);

  const centerActiveRailItem = (behavior: ScrollBehavior = "smooth") => {
    const rail = railRef.current;
    const item = activeRailItemRef.current;
    if (!rail || !item) return;

    rail.scrollTo({
      left: item.offsetLeft + item.offsetWidth / 2 - rail.clientWidth / 2,
      behavior,
    });
  };

  useEffect(() => {
    requestAnimationFrame(() => centerActiveRailItem("smooth"));
  }, [activeEntry?.railId]);

  useEffect(() => {
    if (findWatchRailEntry(workId)) {
      setSelectedRailId(workId);
    }
  }, [workId]);

  const selectRailEntry = (railId: string) => {
    setSelectedRailId(railId);
    void navigate({
      to: "/watch/$work",
      params: { work: railId },
      replace: true,
    });
  };

  const handleRailPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    railDragRef.current = {
      isDragging: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
    };
  };

  const handleRailPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = railDragRef.current;
    if (!drag.isDragging) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const isHorizontalDrag =
      Math.abs(deltaX) > WATCH_RAIL_DRAG_THRESHOLD_PX &&
      Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontalDrag) {
      drag.moved = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.currentTarget.scrollLeft = drag.scrollLeft - deltaX * 1.4;
      event.preventDefault();
    }
  };

  const handleRailPointerEnd = (event: PointerEvent<HTMLElement>) => {
    const didDrag = railDragRef.current.moved;
    railDragRef.current.isDragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (didDrag) {
      window.setTimeout(() => {
        railDragRef.current.moved = false;
      }, 0);
    }
  };

  if (!activeWork) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className={styles.watchPage}>
      <div className={styles.watchBackdrop} aria-hidden="true">
        <img src={activeWork.cover} alt="" />
      </div>

      <header className={styles.watchHeader}>
        <Link className={styles.watchBack} to="/login">
          <ChevronLeft strokeWidth={1.8} aria-hidden="true" />
          <span>{t("common.back")}</span>
        </Link>
        <div className={styles.watchMeta}>
          <h1>{activeWork.title}</h1>
        </div>
        <button
          type="button"
          className={styles.watchCreateCta}
          onClick={() => setLoginOpen(true)}
        >
          {t("auth.watch.createNow")}
        </button>
      </header>

      <section className={styles.watchStage} aria-label={activeWork.title}>
        <video
          key={activeEntry.railId}
          ref={stageVideoRef}
          className={styles.watchVideo}
          src={activeWork.preview}
          poster={activeWork.cover}
          autoPlay
          muted={!soundOn}
          playsInline
        />
        <button
          type="button"
          className={styles.watchSoundToggle}
          onClick={toggleSound}
          aria-pressed={soundOn}
        >
          {soundOn ? (
            <Volume2 size={18} strokeWidth={1.9} aria-hidden="true" />
          ) : (
            <VolumeX size={18} strokeWidth={1.9} aria-hidden="true" />
          )}
          <span>{soundOn ? t("auth.watch.soundOn") : t("auth.watch.soundOff")}</span>
        </button>
      </section>

      <div className={styles.watchRailWrap}>
        {previousWork ? (
          <button
            type="button"
            className={`${styles.watchRailControl} ${styles.watchRailControlPrev}`}
            aria-label={t("auth.watch.previous")}
            onClick={() => selectRailEntry(previousWork.railId)}
          >
            <ChevronLeft strokeWidth={1.9} aria-hidden="true" />
          </button>
        ) : null}
        <nav
          className={styles.watchRail}
          aria-label={t("auth.community.label")}
          ref={railRef}
          onPointerDown={handleRailPointerDown}
          onPointerMove={handleRailPointerMove}
          onPointerUp={handleRailPointerEnd}
          onPointerCancel={handleRailPointerEnd}
        >
          {watchRailEntries.map((entry) => {
            const isActive = entry.railId === activeEntry.railId;
            return (
              <button
                key={entry.railId}
                type="button"
                className={styles.watchRailItem}
                data-active={isActive ? "true" : undefined}
                aria-current={isActive ? "true" : undefined}
                ref={isActive ? activeRailItemRef : undefined}
                onClick={(event) => {
                  if (railDragRef.current.moved) {
                    event.preventDefault();
                    railDragRef.current.moved = false;
                    return;
                  }
                  selectRailEntry(entry.railId);
                }}
              >
                <img
                  src={entry.work.cover}
                  alt=""
                  loading="lazy"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>
        {nextWork ? (
          <button
            type="button"
            className={`${styles.watchRailControl} ${styles.watchRailControlNext}`}
            aria-label={t("auth.watch.next")}
            onClick={() => selectRailEntry(nextWork.railId)}
          >
            <ChevronRight strokeWidth={1.9} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}

export const Route = createFileRoute("/watch/$work")({
  component: WatchPage,
});
