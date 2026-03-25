import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { createQueryClient } from "@/lib/queryClient";
import ProjectDetail from "./ProjectDetail";
import React from "react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    locale: "ko",
    localeLabels: {},
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

const baseProject = {
  id: "project-1",
  name: "테스트 프로젝트",
  description: "테스트용 프로젝트",
  department: "영업부",
  departmentTags: ["영업부"],
  templateId: "template-1",
  trainingPageId: "page-1",
  trainingLinkToken: "token-1",
  smtpAccountId: null,
  fromName: "보안팀",
  fromEmail: "security@example.com",
  timezone: "Asia/Seoul",
  notificationEmails: [],
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: "2025-01-02T00:00:00.000Z",
  status: "진행중",
  targetCount: 3,
  openCount: 1,
  clickCount: 1,
  submitCount: 0,
  reportCaptureInboxFileKey: null,
  reportCaptureEmailFileKey: null,
  reportCaptureMaliciousFileKey: null,
  reportCaptureTrainingFileKey: null,
  sendValidationError: null,
  fiscalYear: 2025,
  fiscalQuarter: 1,
  weekOfYear: [1],
  createdAt: "2024-12-31T00:00:00.000Z",
};

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
};

describe("ProjectDetail", () => {
  it("로딩 상태를 표시한다", () => {
    server.use(
      http.get(/\/api\/projects\/[^/]+$/, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(baseProject);
      }),
      http.get(/\/api\/projects\/[^/]+\/action-logs$/, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ items: [] });
      }),
    );

    const { container } = renderWithClient(<ProjectDetail projectId="project-1" />);
    expect(container).toMatchSnapshot();
  });

  it("빈 상태를 표시한다", async () => {
    server.use(
      http.get(/\/api\/projects\/[^/]+$/, () => {
        return HttpResponse.json(baseProject);
      }),
      http.get(/\/api\/projects\/[^/]+\/action-logs$/, () => {
        return HttpResponse.json({ items: [] });
      }),
    );

    const { container } = renderWithClient(<ProjectDetail projectId="project-1" />);
    await screen.findByText("대상자가 없습니다");
    expect(container).toMatchSnapshot();
  });

  it("정상 상태를 표시한다", async () => {
    server.use(
      http.get(/\/api\/projects\/[^/]+$/, () => {
        return HttpResponse.json(baseProject);
      }),
      http.get(/\/api\/projects\/[^/]+\/action-logs$/, () => {
        return HttpResponse.json({
          items: [
            {
              projectTargetId: "pt-1",
              targetId: "target-1",
              name: "김철수",
              email: "kim@example.com",
              department: "영업부",
              status: "클릭",
              statusCode: "clicked",
              trackingToken: "track-1",
              events: [
                {
                  type: "OPEN",
                  label: "열람",
                  at: "2025-01-01T09:00:00.000Z",
                },
                {
                  type: "CLICK",
                  label: "클릭",
                  at: "2025-01-01T09:05:00.000Z",
                },
              ],
            },
          ],
        });
      }),
    );

    const { container } = renderWithClient(<ProjectDetail projectId="project-1" />);
    await screen.findByText("상세 로그");
    expect(container).toMatchSnapshot();
  });
});
