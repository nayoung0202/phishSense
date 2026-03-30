import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TENANT_A_ID,
  buildProjectFixture,
  buildProjectTargetFixture,
  buildReportInstanceFixture,
  buildTargetFixture,
  buildTemplateFixture,
} from "@/test/tenantFixtures";

const DEFAULT_TEMPLATE_PATH = path.join(
  process.cwd(),
  "attached_assets",
  "default_report_template.docx",
);
const DEFAULT_CONFIDENTIAL_PATH = path.join(
  process.cwd(),
  "attached_assets",
  "confidential_logo.png",
);

const createEmitter = () => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  return {
    on(event: string, callback: (...args: unknown[]) => void) {
      const current = listeners.get(event) ?? [];
      current.push(callback);
      listeners.set(event, current);
    },
    emit(event: string, ...args: unknown[]) {
      (listeners.get(event) ?? []).forEach((callback) => callback(...args));
    },
  };
};

const childProcessMock = vi.hoisted(() => {
  let lastPayload = "";

  return {
    spawn: vi.fn(() => {
      lastPayload = "";
      const child = createEmitter();
      const stderr = createEmitter();

      return {
        ...child,
        stderr: {
          ...stderr,
          setEncoding: vi.fn(),
        },
        stdin: {
          write: vi.fn((chunk: string | Uint8Array) => {
            lastPayload += Buffer.from(chunk).toString("utf-8");
          }),
          end: vi.fn(() => {
            queueMicrotask(() => {
              child.emit("close", 0);
            });
          }),
        },
      };
    }),
    getLastPayload: () => lastPayload,
    reset: () => {
      lastPayload = "";
    },
  };
});

const fsMock = vi.hoisted(() => ({
  promises: {
    copyFile: vi.fn(),
  },
}));

const tenantStorageMock = vi.hoisted(() => ({
  getProjectForTenant: vi.fn(),
  getProjectsForTenant: vi.fn(),
  getReportSettingForTenant: vi.fn(),
  getReportTemplateForTenant: vi.fn(),
  getActiveReportTemplateInTenant: vi.fn(),
  createReportTemplateForTenant: vi.fn(),
  getProjectTargetsForTenant: vi.fn(),
  getTargetForTenant: vi.fn(),
  getTemplateForTenant: vi.fn(),
  createReportInstanceForTenant: vi.fn(),
  updateReportInstanceForTenantScope: vi.fn(),
}));

const reportStorageMock = vi.hoisted(() => ({
  buildTemplateFileKey: vi.fn(),
  buildReportFileKey: vi.fn(),
  ensureDirectoryForFile: vi.fn(),
  fileExists: vi.fn(),
  resolveStoragePath: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: childProcessMock.spawn,
  default: {
    spawn: childProcessMock.spawn,
  },
}));

vi.mock("../tenant/tenantStorage", () => ({
  getProjectForTenant: tenantStorageMock.getProjectForTenant,
  getProjectsForTenant: tenantStorageMock.getProjectsForTenant,
  getReportSettingForTenant: tenantStorageMock.getReportSettingForTenant,
  getReportTemplateForTenant: tenantStorageMock.getReportTemplateForTenant,
  getActiveReportTemplateInTenant: tenantStorageMock.getActiveReportTemplateInTenant,
  createReportTemplateForTenant: tenantStorageMock.createReportTemplateForTenant,
  getProjectTargetsForTenant: tenantStorageMock.getProjectTargetsForTenant,
  getTargetForTenant: tenantStorageMock.getTargetForTenant,
  getTemplateForTenant: tenantStorageMock.getTemplateForTenant,
  createReportInstanceForTenant: tenantStorageMock.createReportInstanceForTenant,
  updateReportInstanceForTenantScope: tenantStorageMock.updateReportInstanceForTenantScope,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const promises = {
    ...actual.promises,
    copyFile: fsMock.promises.copyFile,
  };
  return {
    ...actual,
    default: {
      ...actual,
      promises,
    },
    promises,
  };
});

vi.mock("./reportStorage", () => ({
  buildTemplateFileKey: reportStorageMock.buildTemplateFileKey,
  buildReportFileKey: reportStorageMock.buildReportFileKey,
  ensureDirectoryForFile: reportStorageMock.ensureDirectoryForFile,
  fileExists: reportStorageMock.fileExists,
  resolveStoragePath: reportStorageMock.resolveStoragePath,
}));

vi.mock("./reportPythonRuntime", () => ({
  resolveReportPythonBin: vi.fn(() => "python3"),
}));

import { generateProjectReport } from "./reportGenerator";

describe("reportGenerator", () => {
  beforeEach(() => {
    childProcessMock.reset();
    childProcessMock.spawn.mockClear();
    fsMock.promises.copyFile.mockReset();

    tenantStorageMock.getProjectForTenant.mockReset();
    tenantStorageMock.getProjectsForTenant.mockReset();
    tenantStorageMock.getReportSettingForTenant.mockReset();
    tenantStorageMock.getReportTemplateForTenant.mockReset();
    tenantStorageMock.getActiveReportTemplateInTenant.mockReset();
    tenantStorageMock.createReportTemplateForTenant.mockReset();
    tenantStorageMock.getProjectTargetsForTenant.mockReset();
    tenantStorageMock.getTargetForTenant.mockReset();
    tenantStorageMock.getTemplateForTenant.mockReset();
    tenantStorageMock.createReportInstanceForTenant.mockReset();
    tenantStorageMock.updateReportInstanceForTenantScope.mockReset();

    reportStorageMock.buildTemplateFileKey.mockReset();
    reportStorageMock.buildReportFileKey.mockReset();
    reportStorageMock.ensureDirectoryForFile.mockReset();
    reportStorageMock.fileExists.mockReset();
    reportStorageMock.resolveStoragePath.mockReset();

    tenantStorageMock.getProjectForTenant.mockResolvedValue(buildProjectFixture());
    tenantStorageMock.getProjectsForTenant.mockResolvedValue([]);
    tenantStorageMock.getReportSettingForTenant.mockResolvedValue({
      id: "setting-1",
      tenantId: TENANT_A_ID,
      name: "기본 설정",
      companyName: "테스트 회사",
      companyLogoFileKey: "tenants/tenant-a/reports/settings/setting-1/logo.png",
      approverName: "보안 책임자",
      approverTitle: "이사",
      isDefault: true,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    });
    tenantStorageMock.getActiveReportTemplateInTenant.mockResolvedValue(undefined);
    tenantStorageMock.createReportTemplateForTenant.mockResolvedValue({
      id: "template-default",
      tenantId: TENANT_A_ID,
      name: "기본 보고서 템플릿",
      version: "v1",
      fileKey: "tenants/tenant-a/reports/templates/template-default/v1/template.docx",
      isActive: true,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    });
    tenantStorageMock.getProjectTargetsForTenant.mockResolvedValue([]);
    tenantStorageMock.getTargetForTenant.mockResolvedValue(undefined);
    tenantStorageMock.getTemplateForTenant.mockResolvedValue(buildTemplateFixture());
    tenantStorageMock.createReportInstanceForTenant.mockResolvedValue(
      buildReportInstanceFixture({
        id: "report-instance-1",
        projectId: "project-1",
        reportSettingId: "setting-1",
        status: "pending",
        fileKey: null,
        errorMessage: null,
        completedAt: null,
      }),
    );
    tenantStorageMock.updateReportInstanceForTenantScope.mockResolvedValue(undefined);

    reportStorageMock.buildTemplateFileKey.mockReturnValue(
      "tenants/tenant-a/reports/templates/template-default/v1/template.docx",
    );
    reportStorageMock.buildReportFileKey.mockReturnValue(
      "tenants/tenant-a/reports/generated/report-instance-1.docx",
    );
    reportStorageMock.ensureDirectoryForFile.mockResolvedValue(undefined);
    reportStorageMock.resolveStoragePath.mockImplementation((fileKey: string) => {
      if (fileKey.includes("logo.png")) return "/tmp/logo.png";
      if (fileKey.includes("report-instance-1.docx")) return "/tmp/report-instance-1.docx";
      if (fileKey.includes("capture")) return `/tmp/${fileKey.replaceAll("/", "_")}.png`;
      if (fileKey.includes("template-old")) return "/tmp/template-old.docx";
      return `/tmp/${fileKey.replaceAll("/", "_")}`;
    });
  });

  it("reportSettingId에 해당하는 설정이 없으면 실패한다", async () => {
    tenantStorageMock.getReportSettingForTenant.mockResolvedValue(undefined);

    await expect(
      generateProjectReport(TENANT_A_ID, "project-1", { reportSettingId: "missing-setting" }),
    ).rejects.toThrow("보고서 설정");
  });

  it("설정 로고 파일이 없으면 실패한다", async () => {
    reportStorageMock.resolveStoragePath.mockReturnValue("/tmp/logo.png");
    reportStorageMock.fileExists.mockImplementation(async (filePath: string) => filePath !== "/tmp/logo.png");

    await expect(
      generateProjectReport(TENANT_A_ID, "project-1", { reportSettingId: "setting-1" }),
    ).rejects.toThrow("로고");
  });

  it("templateId가 없으면 attached_assets 기본 템플릿을 우선 사용한다", async () => {
    tenantStorageMock.getActiveReportTemplateInTenant.mockResolvedValue({
      id: "template-old",
      tenantId: TENANT_A_ID,
      name: "기본 보고서 템플릿",
      version: "v3",
      fileKey: "tenants/tenant-a/reports/templates/template-old/v3/template.docx",
      isActive: true,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    });
    reportStorageMock.resolveStoragePath.mockImplementation((fileKey: string) => {
      if (fileKey.includes("reports/settings/setting-1/logo.png")) return "/tmp/logo.png";
      if (fileKey.includes("template-old")) return "/tmp/template-old.docx";
      return "/tmp/other";
    });
    reportStorageMock.fileExists.mockImplementation(async (filePath: string) => {
      if (filePath === "/tmp/logo.png") return true;
      if (filePath === DEFAULT_TEMPLATE_PATH) return true;
      if (filePath === DEFAULT_CONFIDENTIAL_PATH) return true;
      return false;
    });

    await expect(
      generateProjectReport(TENANT_A_ID, "project-1", { reportSettingId: "setting-1" }),
    ).rejects.toThrow("보고서 캡처 이미지");

    expect(fsMock.promises.copyFile).not.toHaveBeenCalled();
    expect(tenantStorageMock.createReportTemplateForTenant).not.toHaveBeenCalled();
  });

  it("실제 대상자, 부서 집계, 비교 요약 데이터를 렌더러에 전달한다", async () => {
    tenantStorageMock.getProjectForTenant.mockResolvedValue(
      buildProjectFixture({
        id: "project-1",
        name: "3분기 모의훈련",
        templateId: "template-1",
        startDate: new Date("2025-07-01T00:00:00Z"),
        endDate: new Date("2025-07-15T00:00:00Z"),
        fiscalYear: 2025,
        fiscalQuarter: 3,
        targetCount: 2,
        openCount: 1,
        clickCount: 1,
        submitCount: 0,
        reportCaptureInboxFileKey: "tenants/tenant-a/capture/inbox",
        reportCaptureEmailFileKey: "tenants/tenant-a/capture/email",
        reportCaptureMaliciousFileKey: "tenants/tenant-a/capture/malicious",
        reportCaptureTrainingFileKey: "tenants/tenant-a/capture/training",
      }),
    );
    tenantStorageMock.getActiveReportTemplateInTenant.mockResolvedValue({
      id: "template-old",
      tenantId: TENANT_A_ID,
      name: "기본 보고서 템플릿",
      version: "v3",
      fileKey: "tenants/tenant-a/reports/templates/template-old/v3/template.docx",
      isActive: true,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    });
    tenantStorageMock.getProjectTargetsForTenant.mockResolvedValue([
      buildProjectTargetFixture({
        id: "pt-1",
        targetId: "target-1",
        status: "clicked",
        openedAt: new Date("2025-07-02T09:00:00Z"),
        clickedAt: new Date("2025-07-02T09:01:00Z"),
      }),
      buildProjectTargetFixture({
        id: "pt-2",
        targetId: "target-2",
        status: "sent",
      }),
    ]);
    tenantStorageMock.getTargetForTenant.mockImplementation(async (_tenantId: string, targetId: string) => {
      if (targetId === "target-1") {
        return buildTargetFixture({
          id: "target-1",
          name: "김보안",
          email: "security@example.com",
          department: "보안팀, 전사본부",
        });
      }
      if (targetId === "target-2") {
        return buildTargetFixture({
          id: "target-2",
          name: "이개발",
          email: "dev@example.com",
          department: "개발팀",
        });
      }
      return undefined;
    });
    tenantStorageMock.getProjectsForTenant.mockResolvedValue([
      buildProjectFixture({
        id: "project-prev",
        name: "2분기 모의훈련",
        status: "완료",
        startDate: new Date("2025-04-01T00:00:00Z"),
        endDate: new Date("2025-04-15T00:00:00Z"),
        fiscalYear: 2025,
        fiscalQuarter: 2,
        targetCount: 4,
        openCount: 2,
        clickCount: 1,
        submitCount: 1,
      }),
    ]);
    tenantStorageMock.getTemplateForTenant.mockResolvedValue(
      buildTemplateFixture({
        id: "template-1",
        name: "급여 명세서 안내",
        subject: "[긴급] 급여 명세서를 확인하세요",
      }),
    );
    reportStorageMock.fileExists.mockResolvedValue(true);

    await generateProjectReport(TENANT_A_ID, "project-1", { reportSettingId: "setting-1" });

    const payload = JSON.parse(childProcessMock.getLastPayload()) as {
      data: {
        detail_rows: Array<Record<string, string>>;
        department_rows: Array<Record<string, string>>;
        comparison_previous_label: string;
        comparison_current_label: string;
        comparison_rows: Array<Record<string, string>>;
      };
    };

    expect(payload.data.detail_rows).toEqual([
      {
        name: "김보안",
        email: "security@example.com",
        opened: "O",
        clicked: "O",
        submitted: "X",
      },
      {
        name: "이개발",
        email: "dev@example.com",
        opened: "X",
        clicked: "X",
        submitted: "X",
      },
    ]);
    expect(payload.data.department_rows).toEqual([
      {
        department: "개발팀",
        target_count_label: "1명",
        open_count_label: "0명 (0.0%)",
        click_count_label: "0명 (0.0%)",
        submit_count_label: "0명 (0.0%)",
      },
      {
        department: "보안팀",
        target_count_label: "1명",
        open_count_label: "1명 (100.0%)",
        click_count_label: "1명 (100.0%)",
        submit_count_label: "0명 (0.0%)",
      },
    ]);
    expect(payload.data.comparison_previous_label).toBe("2분기");
    expect(payload.data.comparison_current_label).toBe("3분기");
    expect(payload.data.comparison_rows).toEqual([
      {
        label: "훈련 대상 수",
        previous_value: "4명",
        current_value: "2명",
        delta_value: "-50.0%",
      },
      {
        label: "메일 열람",
        previous_value: "2명 (50.0%)",
        current_value: "1명 (50.0%)",
        delta_value: "0.0%p",
      },
      {
        label: "링크 클릭",
        previous_value: "1명 (25.0%)",
        current_value: "1명 (50.0%)",
        delta_value: "+25.0%p",
      },
      {
        label: "개인정보 입력",
        previous_value: "1명 (25.0%)",
        current_value: "0명 (0.0%)",
        delta_value: "-25.0%p",
      },
    ]);
  });
});
