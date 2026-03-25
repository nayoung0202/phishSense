import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { createQueryClient } from "@/lib/queryClient";
import { ReportGenerateDialog } from "./ReportGenerateDialog";

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    locale: "ko",
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const fetchMock = vi.fn();

const project: Project = {
  id: "project-1",
  name: "보고서 생성 테스트",
  description: "보고서 생성용 프로젝트",
  department: "보안팀",
  departmentTags: ["보안팀"],
  templateId: "template-1",
  trainingPageId: "training-1",
  trainingLinkToken: "token-1",
  smtpAccountId: null,
  fromName: "보안팀",
  fromEmail: "security@example.com",
  timezone: "Asia/Seoul",
  notificationEmails: [],
  startDate: "2026-03-01T00:00:00.000Z",
  endDate: "2026-03-02T00:00:00.000Z",
  status: "진행중",
  targetCount: 10,
  openCount: 0,
  clickCount: 0,
  submitCount: 0,
  reportCaptureInboxFileKey: null,
  reportCaptureEmailFileKey: null,
  reportCaptureMaliciousFileKey: null,
  reportCaptureTrainingFileKey: null,
  sendValidationError: null,
  fiscalYear: 2026,
  fiscalQuarter: 1,
  weekOfYear: [10],
  createdAt: "2026-02-28T00:00:00.000Z",
};

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe("ReportGenerateDialog", () => {
  it("훈련안내페이지 캡처 필드가 보이도록 더 넓은 모달 크기를 사용한다", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "setting-1",
            name: "기본 설정",
            companyName: "PhishSense",
            approverName: "관리자",
            approverTitle: "팀장",
            isDefault: true,
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <ReportGenerateDialog
        open={true}
        onOpenChange={() => {}}
        project={project}
      />,
    );

    await screen.findByText("reports.capture.trainingPage.label");

    expect(screen.getByTestId("report-generate-dialog")).toHaveClass(
      "max-h-[92vh]",
      "w-[96vw]",
      "max-w-[64rem]",
    );
  });
});
