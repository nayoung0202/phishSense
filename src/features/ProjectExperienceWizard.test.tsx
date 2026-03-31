import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { createQueryClient } from "@/lib/queryClient";
import ProjectExperienceWizard from "./ProjectExperienceWizard";

const pushMock = vi.fn();
const toastMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

const renderWithClient = (ui: ReactElement) => {
  const queryClient = createQueryClient();

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const buildTemplateCandidate = () => ({
  id: "template-candidate-1",
  subject: "배송 정보 확인 요청",
  body: "<p>배송 주소를 확인해 주세요.</p>",
  maliciousPageContent: "<form><button type=\"submit\">확인</button></form>",
  summary: "배송 정보 확인 메일",
});

const buildSavedTemplate = () => ({
  id: "template-1",
  tenantId: "tenant-1",
  name: "배송 정보 확인 요청",
  subject: "배송 정보 확인 요청",
  body: "<p>배송 주소를 확인해 주세요.</p>",
  maliciousPageContent: "<form><button type=\"submit\">확인</button></form>",
  autoInsertLandingEnabled: true,
  autoInsertLandingLabel: "문서 확인하기",
  autoInsertLandingKind: "link",
  autoInsertLandingNewTab: true,
  createdAt: "2026-03-19T00:00:00.000Z",
  updatedAt: "2026-03-19T00:00:00.000Z",
});

const buildTrainingCandidate = () => ({
  id: "training-candidate-1",
  name: "훈련 안내 페이지",
  description: "훈련 안내 설명",
  content: "<section><h1>훈련 안내</h1></section>",
  summary: "훈련 안내 요약",
});

const buildSavedTrainingPage = () => ({
  id: "training-page-1",
  tenantId: "tenant-1",
  name: "훈련 안내 페이지",
  description: "훈련 안내 설명",
  content: "<section><h1>훈련 안내</h1></section>",
  status: "active",
  createdAt: "2026-03-19T00:00:00.000Z",
  updatedAt: "2026-03-19T00:00:00.000Z",
});

const buildSmtpConfig = () => ({
  id: "smtp-1",
  tenantId: "tenant-1",
  host: "smtp.example.com",
  port: 587,
  securityMode: "STARTTLS" as const,
  username: "alerts@example.com",
  allowedSenderDomains: ["example.com"],
  isActive: true,
  hasPassword: true,
  lastTestedAt: "2026-03-19T00:00:00.000Z",
  lastTestStatus: "success" as const,
  updatedAt: "2026-03-19T00:00:00.000Z",
});

const setupHandlers = (options: { smtpReady: boolean }) => {
  server.use(
    http.get("/api/auth/session", () =>
      HttpResponse.json({
        authenticated: true,
        user: {
          email: "tester@example.com",
          name: "테스터",
        },
      }),
    ),
    http.get("/api/admin/smtp-configs", () =>
      HttpResponse.json(options.smtpReady ? [buildSmtpConfig()] : []),
    ),
    http.post("/api/templates/ai-generate", () =>
      HttpResponse.json({
        candidates: [buildTemplateCandidate()],
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
    http.post("/api/templates", () => HttpResponse.json(buildSavedTemplate())),
    http.post("/api/training-pages/ai-generate", () =>
      HttpResponse.json({
        candidates: [buildTrainingCandidate()],
      }),
    ),
    http.post("/api/training-pages/ai-apply", () =>
      HttpResponse.json({
        ok: true,
        tenantId: "tenant-1",
        charged: true,
        chargedCredits: 1,
        remainingCredits: 0,
      }),
    ),
    http.post("/api/training-pages", () => HttpResponse.json(buildSavedTrainingPage())),
  );
};

const getStepCard = (heading: string) => {
  const card = screen.getByRole("heading", { name: heading }).closest('[tabindex="-1"]');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`Step card not found for heading: ${heading}`);
  }

  return card;
};

const completeTrainingSetup = async () => {
  fireEvent.click(screen.getByRole("button", { name: "메일 후보 생성" }));
  fireEvent.click(await screen.findByRole("button", { name: "이 메일로 진행" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "훈련 안내 페이지 생성" })).toBeEnabled();
  });

  fireEvent.click(screen.getByRole("button", { name: "훈련 안내 페이지 생성" }));
  fireEvent.click(await screen.findByRole("button", { name: "이 안내 페이지로 진행" }));
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  toastMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ProjectExperienceWizard", () => {
  it("SMTP가 이미 연결되어 있으면 훈련 안내 페이지 저장 후 Step 4로 포커스가 이동한다", async () => {
    setupHandlers({ smtpReady: true });

    renderWithClient(<ProjectExperienceWizard />);

    await completeTrainingSetup();

    await waitFor(() => {
      expect(getStepCard("내 메일로 실제 발송")).toHaveFocus();
    });
  });

  it("SMTP가 아직 없으면 훈련 안내 페이지 저장 후 Step 3에 머문다", async () => {
    setupHandlers({ smtpReady: false });

    renderWithClient(<ProjectExperienceWizard />);

    await completeTrainingSetup();

    await waitFor(() => {
      expect(getStepCard("SMTP 연결 확인")).toHaveFocus();
    });
  });

  it("발송 설정 열기 버튼을 표시한다", async () => {
    setupHandlers({ smtpReady: false });

    renderWithClient(<ProjectExperienceWizard />);

    expect(await screen.findByRole("button", { name: "발송 설정 열기" })).toBeInTheDocument();
  });
});
