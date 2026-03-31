import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { TRAINING_PAGE_AI_DRAFT_SESSION_KEY } from "@shared/trainingPageAi";
import { PLATFORM_CONTEXT_QUERY_KEY } from "@/hooks/usePlatformContext";
import { server } from "@/mocks/server";
import { createQueryClient } from "@/lib/queryClient";
import { buildTenantCreditsQueryKey } from "@/lib/tenantCreditsRealtime";
import { TrainingPageAiGenerateDialog } from "./TrainingPageAiGenerateDialog";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/components/I18nProvider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/i18n")>("@/lib/i18n");
  const messages = actual.getMessages("ko");

  return {
    useI18n: () => ({
      t: (key: Parameters<typeof actual.formatMessage>[1], values?: Parameters<typeof actual.formatMessage>[2]) =>
        actual.formatMessage(messages, key, values),
    }),
  };
});

const buildCandidates = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: `${prefix} 후보 ${index + 1}`,
    description: `${prefix} 설명 ${index + 1}`,
    content: `<div><p>${prefix} 학습 안내 ${index + 1}</p></div>`,
    summary: `${prefix} 요약 ${index + 1}`,
  }));

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return {
    ...result,
    queryClient,
  };
};

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  window.sessionStorage.clear();
});

describe("TrainingPageAiGenerateDialog", () => {
  it("초기 화면에서 옵션과 첨부파일 입력을 보여준다", () => {
    renderWithClient(<TrainingPageAiGenerateDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("1단계. 생성 조건 설정")).toBeInTheDocument();
    expect(screen.getByText("문체")).toBeInTheDocument();
    expect(screen.getByLabelText("훈련안내페이지 첨부파일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 훈련안내페이지 생성" })).toBeInTheDocument();
    expect(screen.getByLabelText("추가 요청사항")).toBeInTheDocument();
    expect(screen.queryByText("주제")).not.toBeInTheDocument();
    expect(screen.queryByText("구분 난이도")).not.toBeInTheDocument();
    expect(screen.getAllByText(/피싱 대응 기본 수칙은 자동으로 포함됩니다\./)).toHaveLength(1);
    expect(screen.getByTestId("training-page-ai-options-dialog")).toHaveClass(
      "max-w-[840px]",
      "max-h-[88vh]",
      "overflow-y-auto",
    );
  });

  it("후보 선택 후 초안을 저장하고 페이지 작성 화면으로 이동한다", async () => {
    server.use(
      http.post("/api/training-pages/ai-generate", () =>
        HttpResponse.json({
          candidates: buildCandidates("학습", 4),
        }),
      ),
      http.post("/api/training-pages/ai-apply", () =>
        HttpResponse.json({
          ok: true,
          tenantId: "tenant-1",
          charged: true,
          chargedCredits: 1,
          remainingCredits: 2,
        }),
      ),
    );

    const { queryClient } = renderWithClient(
      <TrainingPageAiGenerateDialog open={true} onOpenChange={() => {}} />,
    );
    queryClient.setQueryData(PLATFORM_CONTEXT_QUERY_KEY, {
      authenticated: true,
      status: "ready",
      hasAccess: true,
      onboardingRequired: false,
      tenantId: "tenant-1",
      currentTenantId: "tenant-1",
      tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
      products: [],
      platformProduct: null,
      localEntitlement: null,
    });
    queryClient.setQueryData(buildTenantCreditsQueryKey("tenant-1"), {
      tenantId: "tenant-1",
      productId: "phishsense",
      balance: 3,
      byokAvailable: false,
      activeAiKeys: 0,
      rechargeUrl: null,
      policies: [],
      recentEvents: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "AI 훈련안내페이지 생성" }));
    await screen.findByText("2단계. 후보 비교 및 선택");

    fireEvent.click(screen.getAllByRole("button", { name: "이 후보 선택" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "선택 후보 반영" }));

    await waitFor(() => {
      const savedDraft = window.sessionStorage.getItem(TRAINING_PAGE_AI_DRAFT_SESSION_KEY);
      expect(savedDraft).not.toBeNull();
      expect(savedDraft).toContain("학습 후보 1");
      expect(
        queryClient.getQueryData<{ balance?: number | null }>(
          buildTenantCreditsQueryKey("tenant-1"),
        )?.balance,
      ).toBe(2);
      expect(pushMock).toHaveBeenCalledWith("/training-pages/new?source=ai");
    });
  });

  it("후보 미리보기 래퍼에 중복 테두리를 추가하지 않는다", async () => {
    server.use(
      http.post("/api/training-pages/ai-generate", () =>
        HttpResponse.json({
          candidates: buildCandidates("테두리", 4),
        }),
      ),
    );

    renderWithClient(<TrainingPageAiGenerateDialog open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "AI 훈련안내페이지 생성" }));
    await screen.findByText("2단계. 후보 비교 및 선택");

    const surfaces = screen.getAllByTestId("training-ai-candidate-preview-surface");
    expect(surfaces.length).toBeGreaterThan(0);
    expect(surfaces[0]).not.toHaveClass("border", "border-slate-200");
    expect(surfaces[0]).toHaveClass("p-4");
  });
});
