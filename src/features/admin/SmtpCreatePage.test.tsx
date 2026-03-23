import React, { type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/queryClient";
import SmtpCreatePage from "./SmtpCreatePage";

const pushMock = vi.fn();
const toastMock = vi.fn();

const apiMock = vi.hoisted(() => ({
  createSmtpConfig: vi.fn(),
  getSmtpConfig: vi.fn(),
  testSmtpConfig: vi.fn(),
  updateSmtpConfig: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/lib/tenant", () => ({
  useAutoTenantId: () => "tenant-1",
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock("@/lib/api", () => apiMock);

const renderWithClient = (ui: ReactElement) => {
  const queryClient = createQueryClient();

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const buildConfig = () => ({
  id: "smtp-new",
  tenantId: "tenant-1",
  name: "alerts@example.com",
  host: "smtp.example.com",
  port: 587,
  securityMode: "STARTTLS" as const,
  username: "alerts@example.com",
  tlsVerify: true,
  rateLimitPerMin: 60,
  allowedSenderDomains: ["example.com"],
  isActive: true,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestError: null,
  hasPassword: true,
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  toastMock.mockReset();
  apiMock.createSmtpConfig.mockReset();
  apiMock.getSmtpConfig.mockReset();
  apiMock.testSmtpConfig.mockReset();
  apiMock.updateSmtpConfig.mockReset();
});

describe("SmtpCreatePage", () => {
  it("저장 후 목록으로 이동하지 않고 테스트 패널을 활성화한다", async () => {
    const savedConfig = buildConfig();
    apiMock.createSmtpConfig.mockResolvedValue({ ok: true, item: savedConfig });
    apiMock.getSmtpConfig.mockResolvedValue(savedConfig);

    renderWithClient(<SmtpCreatePage />);

    expect(screen.getByLabelText("테스트 발신 이메일 *")).toBeDisabled();
    expect(screen.getByText("등록을 완료한 뒤 테스트하세요.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("SMTP 호스트"), {
      target: { value: "smtp.example.com" },
    });
    fireEvent.change(screen.getByLabelText("도메인 입력"), {
      target: { value: "example.com" },
    });
    fireEvent.keyDown(screen.getByLabelText("도메인 입력"), {
      key: "Enter",
      code: "Enter",
      charCode: 13,
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(apiMock.createSmtpConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "smtp.example.com",
          port: 587,
          securityMode: "STARTTLS",
          allowedSenderDomains: ["example.com"],
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("테스트 발신 이메일 *")).not.toBeDisabled();
    });

    expect(pushMock).not.toHaveBeenCalledWith("/admin/smtp");
    expect(screen.queryByText("등록을 완료한 뒤 테스트하세요.")).not.toBeInTheDocument();
  });
});
