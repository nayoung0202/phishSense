import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TENANT_A_ID,
  buildProjectFixture,
  buildReportInstanceFixture,
} from "@/test/tenantFixtures";

const currentTenantMock = vi.hoisted(() => ({
  requireReadyTenant: vi.fn(),
  buildReadyTenantErrorResponse: vi.fn((_error, message: string, status = 500) =>
    Response.json({ error: message }, { status }),
  ),
}));

const tenantStorageMock = vi.hoisted(() => ({
  getReportInstanceForTenant: vi.fn(),
  getProjectForTenant: vi.fn(),
}));

const reportStorageMock = vi.hoisted(() => ({
  fileExists: vi.fn(),
  resolveStoragePath: vi.fn(),
}));

const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/tenant/currentTenant", () => currentTenantMock);
vi.mock("@/server/tenant/tenantStorage", () => tenantStorageMock);
vi.mock("@/server/services/reportStorage", () => ({
  fileExists: reportStorageMock.fileExists,
  resolveStoragePath: reportStorageMock.resolveStoragePath,
}));
vi.mock("node:fs", () => ({
  default: { promises: { readFile: readFileMock } },
  promises: { readFile: readFileMock },
}));

import { GET } from "./route";

const baseInstance = buildReportInstanceFixture({
  id: "instance-1",
  tenantId: TENANT_A_ID,
  projectId: "project-1",
  templateId: "template-1",
  reportSettingId: "setting-1",
  fileKey: "tenants/tenant-a/reports/generated/instance-1.docx",
  completedAt: new Date("2025-01-02T03:04:05Z"),
});

const baseProject = buildProjectFixture({
  id: "project-1",
  tenantId: TENANT_A_ID,
  name: "연간 보안 훈련",
});

describe("GET /api/reports/[id]/download", () => {
  beforeEach(() => {
    currentTenantMock.requireReadyTenant.mockReset();
    tenantStorageMock.getReportInstanceForTenant.mockReset();
    tenantStorageMock.getProjectForTenant.mockReset();
    reportStorageMock.fileExists.mockReset();
    reportStorageMock.resolveStoragePath.mockReset();
    readFileMock.mockReset();

    currentTenantMock.requireReadyTenant.mockResolvedValue({ tenantId: TENANT_A_ID });
    tenantStorageMock.getReportInstanceForTenant.mockResolvedValue(baseInstance);
    tenantStorageMock.getProjectForTenant.mockResolvedValue(baseProject);
    reportStorageMock.resolveStoragePath.mockReturnValue("/tmp/reports/instance-1.docx");
    reportStorageMock.fileExists.mockResolvedValue(true);
    readFileMock.mockResolvedValue(Buffer.from("report-binary"));
    process.env.REPORT_COMPANY_NAME = "Acme Security";
  });

  it("완료된 보고서가 없으면 404를 반환한다", async () => {
    tenantStorageMock.getReportInstanceForTenant.mockResolvedValueOnce(undefined);

    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: "missing-report" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("보고서 파일이 준비되지 않았습니다.");
  });

  it("파일이 없으면 404를 반환한다", async () => {
    reportStorageMock.fileExists.mockResolvedValueOnce(false);

    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: "instance-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("보고서 파일을 찾을 수 없습니다.");
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("정상 요청이면 docx 첨부 파일을 반환한다", async () => {
    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: "instance-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    expect(response.headers.get("Content-Disposition")).toContain("Acme_Security");
    expect(readFileMock).toHaveBeenCalledWith("/tmp/reports/instance-1.docx");
  });

  it("pdf 보고서는 pdf 첨부 파일을 반환한다", async () => {
    tenantStorageMock.getReportInstanceForTenant.mockResolvedValueOnce(
      buildReportInstanceFixture({
        ...baseInstance,
        fileKey: "tenants/tenant-a/reports/generated/instance-1.pdf",
      }),
    );
    reportStorageMock.resolveStoragePath.mockReturnValueOnce("/tmp/reports/instance-1.pdf");

    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ id: "instance-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(".pdf");
    expect(readFileMock).toHaveBeenCalledWith("/tmp/reports/instance-1.pdf");
  });
});
