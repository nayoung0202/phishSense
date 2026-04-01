"use client";

import type { ReactNode } from "react";

export function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(78,195,224,0.12),transparent_28%),linear-gradient(180deg,rgba(7,13,24,0.96),rgba(5,8,16,1))]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
