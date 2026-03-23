import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { createQueryClient } from "@/lib/queryClient";
import ProjectCreate from "./ProjectCreate";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const toastMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
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

const buildSmtpConfig = () => ({
  id: "smtp-1",
  tenantId: "tenant-1",
  name: "기본 발송",
  host: "smtp.example.com",
  port: 587,
  securityMode: "STARTTLS" as const,
  username: "alerts@example.com",
  allowedSenderDomains: ["example.com"],
  isActive: true,
  hasPassword: true,
  lastTestedAt: "2026-03-24T00:00:00.000Z",
  lastTestStatus: "success" as const,
  updatedAt: "2026-03-24T00:00:00.000Z",
});

const setupHandlers = (smtpConfigs = [buildSmtpConfig()]) => {
  server.use(
    http.get("/api/targets", () => HttpResponse.json([])),
    http.get("/api/templates", () => HttpResponse.json([])),
    http.get("/api/training-pages", () => HttpResponse.json([])),
    http.get("/api/admin/smtp-configs", () => HttpResponse.json(smtpConfigs)),
  );
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
  replaceMock.mockReset();
  toastMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ProjectCreate", () => {
  it("발신 이메일 형식 오류는 제출 전 상단 요약 경고를 띄우지 않는다", async () => {
    setupHandlers([]);

    renderWithClient(<ProjectCreate />);

    const emailInput = await screen.findByPlaceholderText("예: security@phishsense.dev");
    fireEvent.change(emailInput, {
      target: { value: "invalid-email" },
    });
    fireEvent.blur(emailInput);

    expect(await screen.findByText("올바른 이메일 주소를 입력하세요.")).toBeInTheDocument();
    expect(screen.queryByText("입력 항목을 확인한 뒤 다시 시도하세요.")).not.toBeInTheDocument();
  });

  it("선택한 발송 설정의 허용 발신 도메인을 발신 이메일 자동완성 후보로 제안한다", async () => {
    setupHandlers();

    renderWithClient(<ProjectCreate />);

    fireEvent.click(await screen.findByText("발송 설정을 선택하세요"));
    fireEvent.click(await screen.findByRole("option", { name: /기본 발송/ }));

    const emailInput = await screen.findByPlaceholderText("예: security@phishsense.dev");
    fireEvent.change(emailInput, {
      target: { value: "security@ex" },
    });

    await waitFor(() => {
      const datalist = document.getElementById("allowed-sender-domain-suggestions");
      expect(datalist).toBeInTheDocument();
      expect(datalist?.querySelector('option[value="security@example.com"]')).not.toBeNull();
    });
  });
});
