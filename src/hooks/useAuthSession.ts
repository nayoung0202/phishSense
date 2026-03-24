"use client";

import { useQuery } from "@tanstack/react-query";

type AuthSessionResponse = {
  authenticated: boolean;
  user?: {
    sub: string;
    email: string | null;
    name: string | null;
  };
  idleExpiresAt?: string;
  absoluteExpiresAt?: string;
  error?: string;
};

export function useAuthSession() {
  return useQuery<AuthSessionResponse>({
    queryKey: ["/api/auth/session"],
    retry: false,
  });
}
