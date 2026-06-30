// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import {
  Link,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";

import {
  Check,
  ChevronDown,
  Clapperboard,
  FishSymbol,
  LayoutDashboard,
  ListChecks,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  Waves,
  WandSparkles,
} from "lucide-react";

import { useMediaQuery } from "@/hooks/use-media-query";
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
  useAppStore,
} from "@/stores/app-store";
import {
  normalizeLastEpisodeLocation,
  useEpisodeWorkbenchStore,
} from "@/stores/episode-workbench-store";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAllProjectSummaries } from "@/lib/queries/projects";
import { getProjectCover } from "@/lib/project-cover";

import { cn } from "@/lib/utils";
type NavItem = {
  labelKey: string;
  icon: React.ElementType;
  to: string;
  rememberKey?: "episodes";
};

const projectItems: NavItem[] = [
  {
    labelKey: "nav.freezone",
    icon: Sparkles,
    to: "/projects/$project/freezone",
  },
  { labelKey: "nav.ingest", icon: FishSymbol, to: "/projects/$project/ingest" },
  {
    labelKey: "nav.assets",
    icon: Waves,
    to: "/projects/$project/characters",
  },
  {
    labelKey: "nav.episodes",
    icon: Clapperboard,
    to: "/projects/$project/episodes",
    rememberKey: "episodes",
  },
  { labelKey: "nav.styles", icon: Palette, to: "/projects/$project/styles" },
  { labelKey: "nav.tasks", icon: ListChecks, to: "/projects/$project/tasks" },
];
const featuredProjectItems = projectItems.slice(0, 1);
const primaryProjectItems = projectItems.slice(1, 4);
const styleProjectItems = projectItems.slice(4, 5);
const utilityProjectItems = projectItems.slice(5);

function ProjectAvatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const { gradient, initial } = useMemo(() => getProjectCover(name), [name]);
  const dim = size === "sm" ? "size-5" : "size-7";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded text-xs font-bold text-white/95",
        dim,
      )}
      style={{ background: gradient }}
    >
      {initial}
    </span>
  );
}

const SWITCHER_SECTION_ROUTES = {
  freezone: "/projects/$project/freezone",
  ingest: "/projects/$project/ingest",
  characters: "/projects/$project/characters",
  episodes: "/projects/$project/episodes",
  styles: "/projects/$project/styles",
  tasks: "/projects/$project/tasks",
  assistant: "/projects/$project/assistant",
} as const;

type SwitcherSection = keyof typeof SWITCHER_SECTION_ROUTES;

function ProjectSwitcher({
  current,
  collapsed,
}: {
  current: string;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: summaries } = useAllProjectSummaries();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const targetSection = useMemo<SwitcherSection>(() => {
    const match = pathname.match(/^\/projects\/[^/]+\/([^/]+)/);
    const segment = match?.[1];
    return segment && segment in SWITCHER_SECTION_ROUTES
      ? (segment as SwitcherSection)
      : "freezone";
  }, [pathname]);
  const projects = useMemo(
    () =>
      (summaries ?? [])
        .filter((p) => p.status === "active")
        .map((p) => ({ id: p.id || p.name, name: p.name })),
    [summaries],
  );
  const currentSummary = useMemo(
    // Match by id first (consistent with the checkmark below). Falling back to a
    // name match only when no id matches avoids picking the wrong project when a
    // different project's name happens to equal the current project's id.
    () =>
      projects.find((p) => p.id === current) ??
      projects.find((p) => p.name === current),
    [current, projects],
  );
  const currentName = currentSummary?.name ?? current;
  const triggerContent = collapsed ? (
    <ProjectAvatar name={currentName} />
  ) : (
    <>
      <span className="min-w-0 flex-1 truncate">{currentName}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
    </>
  );
  const dropdownTrigger = (
    <DropdownMenuTrigger
      className={cn(
        "relative z-10 flex h-9 w-full cursor-pointer items-center overflow-hidden rounded-[10px] border border-white/[0.10] bg-transparent text-left text-sm text-sidebar-foreground transition-[background-color,border-color,padding,gap] duration-500 ease-[var(--ease-out-quint)]",
        "hover:bg-white/[0.025]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        "[&_svg]:pointer-events-none",
        collapsed ? "justify-center px-0" : "gap-2 px-3",
      )}
      aria-label={collapsed ? t("nav.switchProject") : undefined}
    >
      {triggerContent}
    </DropdownMenuTrigger>
  );
  const triggerNode = collapsed ? (
    <Tooltip>
      <TooltipTrigger render={dropdownTrigger} />
      <TooltipContent
        side="right"
        sideOffset={16}
        showArrow={false}
        className="border border-white/10 bg-background/95 text-foreground shadow-none"
      >
        {t("nav.switchProject")}
      </TooltipContent>
    </Tooltip>
  ) : (
    dropdownTrigger
  );

  return (
    <DropdownMenu>
      {triggerNode}
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-52 rounded-md border border-white/10 bg-popover p-1 shadow-xl shadow-black/20 ring-0"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t("nav.switchProject")}
          </DropdownMenuLabel>
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() =>
                navigate({
                  to: SWITCHER_SECTION_ROUTES[targetSection],
                  params: { project: project.id },
                })
              }
              className="min-h-8 gap-2 rounded-sm px-2 py-1.5 text-xs focus:bg-white/8 focus:text-current"
            >
              <ProjectAvatar name={project.name} />
              <span className="flex-1 truncate">{project.name}</span>
              {project.id === current && (
                <Check className="size-3.5 text-primary" aria-hidden />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => navigate({ to: "/" })}
            className="min-h-8 gap-2 rounded-sm px-2 py-1.5 text-xs focus:bg-white/8 focus:text-current"
          >
            <Plus className="size-3.5" />
            {t("project.create")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLink({
  item,
  params,
  collapsed,
  pathname,
  t,
}: {
  item: NavItem;
  params: Record<string, string>;
  collapsed: boolean;
  pathname: string;
  t: (key: string) => string;
}) {
  const Icon = item.icon;
  const label = t(item.labelKey);
  const [motionKey, setMotionKey] = useState(0);
  const rememberedEpisodeLocation = useEpisodeWorkbenchStore(
    (s) => s.lastEpisodeLocationByProject[params.project],
  );
  const target =
    item.rememberKey === "episodes" && rememberedEpisodeLocation
      ? normalizeLastEpisodeLocation(params.project, rememberedEpisodeLocation) ??
        item.to
      : item.to;
  const isSectionActive = isProjectSectionActive(pathname, item.to, params.project);
  const link = (
    <Link
      to={target}
      params={params}
      onClick={() => setMotionKey((key) => key + 1)}
      className={cn(
        "relative flex h-10 items-center overflow-hidden border border-transparent rounded-[8px] text-sm font-medium text-muted-foreground transition-[background-color,border-color,color,padding,gap] duration-500 ease-[var(--ease-out-quint)]",
        "hover:border-white/10 hover:bg-white/[0.035] hover:text-sidebar-foreground",
        "[&.active]:bg-primary/10 [&.active]:text-sidebar-foreground [&.active>svg]:text-primary",
        isSectionActive &&
          "bg-primary/10 text-sidebar-foreground [&>svg]:text-primary",
        collapsed ? "justify-center rounded-[8px] px-0" : "gap-3 rounded-[8px] px-4",
      )}
      aria-current={isSectionActive ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
    >
      <Icon
        key={motionKey}
        className={cn(
          "size-4 shrink-0 transition-colors",
          motionKey > 0 && "animate-sidebar-icon-pop",
        )}
      />
      <span
        className={cn(
          "min-w-0 truncate whitespace-nowrap transition-[opacity,width,transform] duration-500 ease-[var(--ease-out-quint)]",
          collapsed
            ? "w-0 translate-x-1 opacity-0"
            : "w-[108px] translate-x-0 opacity-100",
        )}
        aria-hidden={collapsed}
      >
        {label}
      </span>
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent
        side="right"
        sideOffset={16}
        showArrow={false}
        className="border border-white/10 bg-background/95 text-foreground shadow-none"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function isProjectSectionActive(
  pathname: string,
  routeTemplate: string,
  project: string,
): boolean {
  const sectionRoot = routeTemplate.replace("$project", encodeURIComponent(project));
  return pathname === sectionRoot || pathname.startsWith(`${sectionRoot}/`);
}

function BackToProjectsNav({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const label = t("project.dashboardTitle");
  const [motionKey, setMotionKey] = useState(0);
  const link = (
    <Link
      to="/"
      onClick={() => setMotionKey((key) => key + 1)}
      className={cn(
        "flex h-7 items-center overflow-hidden rounded-[7px] text-xs font-normal text-muted-foreground/80 transition-[background-color,color,padding,gap] duration-500 ease-[var(--ease-out-quint)]",
        "hover:bg-white/[0.02] hover:text-sidebar-foreground/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed ? "justify-center px-0" : "justify-center gap-2 px-2.5",
      )}
      aria-label={collapsed ? label : undefined}
    >
      {collapsed && (
        <LayoutDashboard
          key={motionKey}
          className={cn(
            "size-3.5 shrink-0",
            motionKey > 0 && "animate-sidebar-icon-pop",
          )}
        />
      )}
      <span
        className={cn(
          "min-w-0 truncate whitespace-nowrap transition-[opacity,width,transform] duration-500 ease-[var(--ease-out-quint)]",
          collapsed
            ? "w-0 translate-x-1 opacity-0"
            : "w-auto translate-x-0 opacity-100",
        )}
        aria-hidden={collapsed}
      >
        {label}
      </span>
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent
        side="right"
        sideOffset={16}
        showArrow={false}
        className="border border-white/10 bg-background/95 text-foreground shadow-none"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const params = useParams({ strict: false }) as {
    project?: string;
  };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setLastEpisodeLocation = useEpisodeWorkbenchStore(
    (s) => s.setLastEpisodeLocation,
  );
  const clearLastEpisodeLocation = useEpisodeWorkbenchStore(
    (s) => s.clearLastEpisodeLocation,
  );

  useEffect(() => {
    if (!params.project) return;
    const episodesRoot = `/projects/${encodeURIComponent(params.project)}/episodes`;
    if (pathname === episodesRoot) {
      clearLastEpisodeLocation(params.project);
      return;
    }

    const match = pathname.match(/^\/projects\/([^/]+)\/episodes\/(\d+)(?:\/|$)/);
    if (!match) return;
    if (decodeURIComponent(match[1]) !== params.project) return;
    setLastEpisodeLocation(
      params.project,
      `${pathname}${window.location.search}`,
    );
  }, [clearLastEpisodeLocation, params.project, pathname, setLastEpisodeLocation]);

  if (!params.project) return null;

  const collapsed = !isDesktop || sidebarCollapsed;
  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const projectParams: Record<string, string> = { project: params.project };
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-white/[0.05] bg-white/[0.04] text-sidebar-foreground transition-[width] duration-500 ease-[var(--ease-out-quint)]"
      style={{ width }}
    >
      <div
        className={cn(
          "flex h-12 items-center transition-[padding] duration-500 ease-[var(--ease-out-quint)]",
          collapsed ? "justify-center px-1" : "px-3",
        )}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "flex items-center overflow-hidden rounded-md text-sm text-sidebar-foreground/70 transition-[color,width,padding,gap] duration-500 ease-[var(--ease-out-quint)] hover:text-sidebar-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed ? "size-8 justify-center" : "gap-2 px-2 py-1.5",
          )}
          aria-label={
            collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")
          }
          title={collapsed ? t("nav.expandSidebar") : undefined}
        >
          <ToggleIcon className="size-4 shrink-0" />
          <span
            className={cn(
              "whitespace-nowrap transition-[opacity,width,transform] duration-500 ease-[var(--ease-out-quint)]",
              collapsed
                ? "w-0 translate-x-1 opacity-0"
                : "w-8 translate-x-0 opacity-100",
            )}
            aria-hidden={collapsed}
          >
            {t("nav.collapse")}
          </span>
        </button>
      </div>

      <div
        className={cn(
          "pb-6 pt-3 transition-[padding] duration-500 ease-[var(--ease-out-quint)]",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <ProjectSwitcher current={params.project} collapsed={collapsed} />
      </div>

      <TooltipProvider delay={180}>
        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden transition-[padding] duration-500 ease-[var(--ease-out-quint)]",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {featuredProjectItems.map((item) => (
            <NavLink
              key={item.labelKey}
              item={item}
              params={projectParams}
              collapsed={collapsed}
              pathname={pathname}
              t={t}
            />
          ))}
          <div
            className={cn(
              "shrink-0 border-t border-white/[0.035]",
              collapsed ? "mx-2 my-0.5" : "mx-2 my-1",
            )}
            aria-hidden
          />
          {primaryProjectItems.map((item) => (
            <NavLink
              key={item.labelKey}
              item={item}
              params={projectParams}
              collapsed={collapsed}
              pathname={pathname}
              t={t}
            />
          ))}
          <NavLink
            item={{
              labelKey: "nav.aiAssistant",
              icon: WandSparkles,
              to: "/projects/$project/assistant",
            }}
            params={projectParams}
            collapsed={collapsed}
            pathname={pathname}
            t={t}
          />
          {styleProjectItems.map((item) => (
            <NavLink
              key={item.labelKey}
              item={item}
              params={projectParams}
              collapsed={collapsed}
              pathname={pathname}
              t={t}
            />
          ))}
          <div
            className={cn(
              "shrink-0 border-t border-white/[0.035]",
              collapsed ? "mx-2 my-0.5" : "mx-2 my-1",
            )}
            aria-hidden
          />
          {utilityProjectItems.map((item) => (
            <NavLink
              key={item.labelKey}
              item={item}
              params={projectParams}
              collapsed={collapsed}
              pathname={pathname}
              t={t}
            />
          ))}
        </nav>
        <div
          className={cn(
            "border-t border-white/[0.035] flex h-9 items-center justify-center transition-[padding] duration-500 ease-[var(--ease-out-quint)]",
            collapsed ? "px-2" : "px-3",
          )}
        >
          <BackToProjectsNav collapsed={collapsed} />
        </div>
      </TooltipProvider>
    </aside>
  );
}
