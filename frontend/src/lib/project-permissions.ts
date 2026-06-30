// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { isCeRuntime } from "@/lib/runtime-config";
import type { ProjectRole, ProjectSummary } from "@/types/project";

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 10,
  editor: 20,
  admin: 30,
  owner: 40,
};

export function projectRole(summary: ProjectSummary): ProjectRole {
  return summary.effectiveRole ?? "owner";
}

export function roleAllows(actual: ProjectRole | undefined, required: ProjectRole): boolean {
  return ROLE_RANK[actual ?? "viewer"] >= ROLE_RANK[required];
}

export function canManageProjectGrants(summary: ProjectSummary): boolean {
  // CE 没有项目分享/grants 概念（AllowAllProjectAccess 恒返回 owner，角色门控会误显
  // EE-only 入口）。edition 门控走运行时 isCeRuntime()，与 credit-balance-badge 同机制。
  if (isCeRuntime()) return false;
  return roleAllows(projectRole(summary), "admin");
}

export function canDeleteProject(summary: ProjectSummary): boolean {
  return projectRole(summary) === "owner";
}

export function isSharedProject(summary: ProjectSummary): boolean {
  return projectRole(summary) !== "owner";
}

export function projectRoleLabel(role: ProjectRole | undefined): string {
  switch (role ?? "owner") {
    case "viewer":
      return "查看者";
    case "editor":
      return "编辑者";
    case "admin":
      return "管理员";
    case "owner":
      return "所有者";
  }
}

