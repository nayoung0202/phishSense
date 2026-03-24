import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TEMPLATE_AI_DRAFT_SESSION_KEY } from "@shared/templateAi";
import { createQueryClient } from "@/lib/queryClient";
import TemplateEdit from "./TemplateEdit";

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe("TemplateEdit", () => {
  it("템플릿 저장 폼은 브라우저 기본 유효성 검사를 사용하지 않는다", () => {
    const { container } = renderWithClient(<TemplateEdit />);
    const form = container.querySelector("form");

    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("novalidate");
  });

  it("AI 초안 반영 시 모달형 HTML을 편집용 정적 컨테이너로 정규화한다", async () => {
    window.sessionStorage.setItem(
      TEMPLATE_AI_DRAFT_SESSION_KEY,
      JSON.stringify({
        id: "draft-1",
        subject: "AI 초안",
        body: '<style>h1,button,a{color:red!important}</style><dialog open class="mail-modal">본문</dialog>',
        maliciousPageContent:
          '<style>body{background:black!important}</style><div style="position:fixed;inset:0;background:#ffffff;"><form action="{{TRAINING_URL}}"><button type="submit">확인</button></form></div>',
        summary: "요약",
        source: "ai",
        generatedAt: new Date().toISOString(),
      }),
    );

    const { container } = renderWithClient(<TemplateEdit />);

    await waitFor(() => {
      expect(container.querySelector("[data-testid='editor-body'] [contenteditable='true']")?.innerHTML)
        .toContain('data-preview-dialog="true"');
    });

    expect(
      container.querySelector("[data-testid='editor-body'] [contenteditable='true']")?.innerHTML,
    ).not.toContain("<style>");
    expect(
      container.querySelector("[data-testid='editor-malicious'] [contenteditable='true']")?.innerHTML,
    ).not.toContain("position:fixed");
    expect(
      container.querySelector("[data-testid='editor-malicious'] [contenteditable='true']")?.innerHTML,
    ).not.toContain("<style>");
  });
});
