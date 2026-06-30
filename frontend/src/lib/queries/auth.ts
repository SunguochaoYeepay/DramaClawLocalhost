// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useAuthStore, type CurrentUser } from "@/stores/auth-store";
import type { OkResponse } from "@/types/api";

export function useCurrentUser(enabled = true) {
  return useQuery({
    queryKey: queryKeys.currentUser(),
    queryFn: async (): Promise<OkResponse<CurrentUser>> => {
      const user = await useAuthStore.getState().getCurrentUser({
        clearOnNetworkFailure: false,
      });
      if (!user) {
        throw new Error("Not authenticated");
      }
      return { ok: true, data: user };
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
