import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SettingsShell } from "./SettingsShell";

describe("SettingsShell", () => {
  it("콘텐츠를 그대로 렌더링한다", () => {
    render(
      <SettingsShell>
        <div>content</div>
      </SettingsShell>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
