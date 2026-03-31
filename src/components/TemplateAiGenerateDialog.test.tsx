import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { TEMPLATE_AI_DRAFT_SESSION_KEY } from "@shared/templateAi";
import { PLATFORM_CONTEXT_QUERY_KEY } from "@/hooks/usePlatformContext";
import { server } from "@/mocks/server";
import { createQueryClient } from "@/lib/queryClient";
import { buildTenantCreditsQueryKey } from "@/lib/tenantCreditsRealtime";
import { TemplateAiGenerateDialog } from "./TemplateAiGenerateDialog";

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
    subject: `${prefix} 후보 ${index + 1}`,
    body: `<a href="{{LANDING_URL}}">${prefix} 메일 ${index + 1}</a>`,
    maliciousPageContent: `<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">${prefix} 제출 ${index + 1}</button></form>`,
    summary: `${prefix} 요약 ${index + 1}`,
  }));

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();

  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return {
    ...result,
    queryClient,
    rerenderWithClient: (nextUi: React.ReactElement) =>
      result.rerender(<QueryClientProvider client={queryClient}>{nextUi}</QueryClientProvider>),
  };
};

const readGenerateFormData = async (request: Request) => {
  const formData = await request.formData();

  return {
    topic: String(formData.get("topic") ?? ""),
    customTopic: String(formData.get("customTopic") ?? ""),
    tone: String(formData.get("tone") ?? ""),
    difficulty: String(formData.get("difficulty") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
    generateCount: Number(formData.get("generateCount") ?? 0),
    preservedCandidates: JSON.parse(String(formData.get("preservedCandidates") ?? "[]")) as Array<{
      id: string;
      subject: string;
    }>,
    mailBodyReferenceAttachment: formData.get("mailBodyReferenceAttachment"),
    maliciousPageReferenceAttachment: formData.get("maliciousPageReferenceAttachment"),
  };
};

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  window.sessionStorage.clear();
});

describe("TemplateAiGenerateDialog", () => {
  it("최초 오픈 시 1단계 옵션 입력만 보인다", () => {
    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("1단계. 생성 조건 설정")).toBeInTheDocument();
    expect(screen.getByLabelText("메일본문 첨부파일")).toBeInTheDocument();
    expect(screen.getByLabelText("악성메일본문 첨부파일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "템플릿 생성" })).toBeInTheDocument();
    expect(screen.queryByText("예상 AI 크레딧 소모")).not.toBeInTheDocument();
    expect(screen.queryByText("2단계. 후보 비교 및 선택")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체 재생성" })).not.toBeInTheDocument();
  });

  it("기타 주제를 선택하면 직접 입력 필드가 보이고 요청에 포함된다", async () => {
    const requests: Array<{ topic: string; customTopic: string }> = [];

    server.use(
      http.post("/api/templates/ai-generate", async ({ request }) => {
        const body = await readGenerateFormData(request);
        requests.push(body);
        return HttpResponse.json({
          candidates: buildCandidates("기타", 4),
        });
      }),
    );

    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "기타" }));

    const customTopicInput = await screen.findByLabelText("주제 직접 입력");
    fireEvent.change(customTopicInput, {
      target: { value: "사내 행사 안내" },
    });

    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));

    await screen.findByText("2단계. 후보 비교 및 선택");

    expect(requests[0]).toEqual(
      expect.objectContaining({
        topic: "other",
        customTopic: "사내 행사 안내",
      }),
    );
  });

  it("후보 생성 성공 시 2단계 후보 비교 화면으로 전환된다", async () => {
    server.use(
      http.post("/api/templates/ai-generate", () =>
        HttpResponse.json({
          candidates: buildCandidates("초기", 4),
        }),
      ),
    );

    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));

    expect(await screen.findByText("2단계. 후보 비교 및 선택")).toBeInTheDocument();
    expect(screen.getByText("초기 후보 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 재생성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택 제외 나머지 재생성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택한 후보 반영" })).toBeInTheDocument();
  });

  it("API 오류 JSON은 사용자 문구만 정리해서 보여준다", async () => {
    server.use(
      http.post("/api/templates/ai-generate", () =>
        HttpResponse.json(
          {
            error: "AI 템플릿 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
            code: "gemini_service_unavailable",
            retryable: true,
          },
          { status: 503 },
        ),
      ),
    );

    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));

    expect(
      await screen.findByText("AI 템플릿 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^503:/)).not.toBeInTheDocument();
  });

  it("크레딧 부족 오류면 충전 버튼을 함께 보여준다", async () => {
    server.use(
      http.post("/api/templates/ai-generate", () =>
        HttpResponse.json(
          {
            error: "크레딧이 부족합니다. 계속 이용하려면 크레딧을 충전해주세요.",
            rechargeUrl: "mailto:sales@evriz.co.kr",
            requiredCredits: 2,
            remainingCredits: 0,
          },
          { status: 402 },
        ),
      ),
    );

    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));

    expect(
      await screen.findByText("크레딧이 부족합니다. 계속 이용하려면 크레딧을 충전해주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "크레딧 충전" })).toHaveAttribute(
      "href",
      "mailto:sales@evriz.co.kr",
    );
  });

  it("옵션 다시 설정 후에도 입력값을 유지하고 후보 비교로 돌아갈 수 있다", async () => {
    let requestCount = 0;

    server.use(
      http.post("/api/templates/ai-generate", () => {
        requestCount += 1;
        return HttpResponse.json({
          candidates: buildCandidates("유지", 4),
        });
      }),
    );

    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    fireEvent.change(screen.getByLabelText("추가 요청사항"), {
      target: { value: "내부 공지처럼 보이게 해 주세요." },
    });
    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));

    await screen.findByText("2단계. 후보 비교 및 선택");
    fireEvent.click(screen.getByRole("button", { name: "옵션 다시 설정" }));

    expect(screen.getByText("1단계. 생성 조건 설정")).toBeInTheDocument();
    expect(screen.getByLabelText("추가 요청사항")).toHaveValue("내부 공지처럼 보이게 해 주세요.");
    expect(screen.getByRole("button", { name: "후보 비교로 돌아가기" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "후보 비교로 돌아가기" }));

    expect(await screen.findByText("2단계. 후보 비교 및 선택")).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("모달을 닫았다가 다시 열면 모든 상태가 초기화된다", async () => {
    server.use(
      http.post("/api/templates/ai-generate", () =>
        HttpResponse.json({
          candidates: buildCandidates("초기화", 4),
        }),
      ),
    );

    const onOpenChange = vi.fn();
    const { rerenderWithClient } = renderWithClient(
      <TemplateAiGenerateDialog open={true} onOpenChange={onOpenChange} />,
    );

    fireEvent.change(screen.getByLabelText("추가 요청사항"), {
      target: { value: "닫았다가 다시 열 때 초기화" },
    });
    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));
    await screen.findByText("2단계. 후보 비교 및 선택");

    rerenderWithClient(<TemplateAiGenerateDialog open={false} onOpenChange={onOpenChange} />);
    rerenderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={onOpenChange} />);

    expect(screen.getByText("1단계. 생성 조건 설정")).toBeInTheDocument();
    expect(screen.getByLabelText("추가 요청사항")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "후보 비교로 돌아가기" })).not.toBeInTheDocument();
  });

  it("선택 제외 나머지 재생성은 선택 후보를 preservedCandidates로 보낸다", async () => {
    const requests: Array<{
      generateCount: number;
      preservedCandidates: Array<{ id: string; subject: string }>;
    }> = [];

    server.use(
      http.post("/api/templates/ai-generate", async ({ request }) => {
        const body = await readGenerateFormData(request);
        requests.push(body);

        return HttpResponse.json({
          candidates: buildCandidates(`재생성-${requests.length}`, body.generateCount),
        });
      }),
    );

    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));
    await screen.findByText("2단계. 후보 비교 및 선택");

    fireEvent.click(screen.getAllByRole("button", { name: "이 후보 선택" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "선택 제외 나머지 재생성" }));

    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });

    expect(requests[1]).toEqual(
      expect.objectContaining({
        generateCount: 3,
        preservedCandidates: [{ id: "재생성-1-1", subject: "재생성-1 후보 1" }],
      }),
    );
  });

  it("전체 재생성은 preservedCandidates 없이 후보 4개를 다시 요청한다", async () => {
    const requests: Array<{
      generateCount: number;
      preservedCandidates: Array<{ id: string; subject: string }>;
    }> = [];

    server.use(
      http.post("/api/templates/ai-generate", async ({ request }) => {
        const body = await readGenerateFormData(request);
        requests.push(body);

        return HttpResponse.json({
          candidates: buildCandidates(`전체-${requests.length}`, body.generateCount),
        });
      }),
    );

    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));
    await screen.findByText("2단계. 후보 비교 및 선택");

    fireEvent.click(screen.getByRole("button", { name: "전체 재생성" }));

    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });

    expect(requests[1]).toEqual(
      expect.objectContaining({
        generateCount: 4,
        preservedCandidates: [],
      }),
    );
  });

  it("선택한 후보 반영은 세션 초안을 저장하고 작성 화면으로 이동한다", async () => {
    server.use(
      http.post("/api/templates/ai-generate", () =>
        HttpResponse.json({
          candidates: buildCandidates("반영", 4),
        }),
      ),
      http.post("/api/templates/ai-apply", () =>
        HttpResponse.json({
          ok: true,
          tenantId: "tenant-1",
          charged: true,
          chargedCredits: 2,
          remainingCredits: 1,
        }),
      ),
    );

    const { queryClient } = renderWithClient(
      <TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />,
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

    fireEvent.click(screen.getByRole("button", { name: "템플릿 생성" }));
    await screen.findByText("2단계. 후보 비교 및 선택");

    fireEvent.click(screen.getAllByRole("button", { name: "이 후보 선택" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "선택한 후보 반영" }));

    await waitFor(() => {
      const savedDraft = window.sessionStorage.getItem(TEMPLATE_AI_DRAFT_SESSION_KEY);
      expect(savedDraft).not.toBeNull();
      expect(savedDraft).toContain("반영 후보 1");
      expect(
        queryClient.getQueryData<{ balance?: number | null }>(
          buildTenantCreditsQueryKey("tenant-1"),
        )?.balance,
      ).toBe(1);
      expect(pushMock).toHaveBeenCalledWith("/templates/new?source=ai");
    });
  });

  it("참고 첨부파일을 선택하면 선택된 파일명이 표시된다", async () => {
    renderWithClient(<TemplateAiGenerateDialog open={true} onOpenChange={() => {}} />);

    const mailFile = new File(["<div>메일 참고</div>"], "mail-reference.html", {
      type: "text/html",
    });
    const landingFile = new File(["image"], "landing-reference.png", { type: "image/png" });
    const createFileList = (file: File) =>
      ({
        0: file,
        length: 1,
        item: (index: number) => (index === 0 ? file : null),
      }) as unknown as FileList;

    const mailInput = screen.getByLabelText("메일본문 첨부파일");
    Object.defineProperty(mailInput, "files", {
      configurable: true,
      value: createFileList(mailFile),
    });
    fireEvent.change(mailInput);

    const landingInput = screen.getByLabelText("악성메일본문 첨부파일");
    Object.defineProperty(landingInput, "files", {
      configurable: true,
      value: createFileList(landingFile),
    });
    fireEvent.change(landingInput);

    expect(await screen.findByText("선택된 파일: mail-reference.html")).toBeInTheDocument();
    expect(screen.getByText("선택된 파일: landing-reference.png")).toBeInTheDocument();
  });
});
