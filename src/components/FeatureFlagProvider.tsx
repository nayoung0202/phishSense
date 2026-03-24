"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FeatureFlags } from "@/lib/featureFlags";

const FeatureFlagContext = createContext<FeatureFlags | null>(null);

export function FeatureFlagProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: FeatureFlags;
}) {
  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  const value = useContext(FeatureFlagContext);

  if (!value) {
    throw new Error("FeatureFlagProvider가 필요합니다.");
  }

  return value;
}
