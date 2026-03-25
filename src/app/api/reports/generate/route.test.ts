import { beforeEach, describe, expect, it, vi } from "vitest";
import { TENANT_A_ID } from "@/test/tenantFixtures";

const currentTenantMock = vi.hoisted(() => ({
  requireReadyTenant: vi.fn(),
  buildReadyTenantErrorResponse: vi.fn((_error, message: string, status = 500) =>
    Response.json({ error: message }, { status }),
  ),
}));

const generatorMock = vi.hoisted(() => ({
  generateProjectReport: vi.fn(),
}));

vi.mock("@/server/tenant/currentTenant", () => currentTenantMock);
vi.mock("@/server/services/reportGenerator", () => ({
  generateProjectReport: generatorMock.generateProjectReport,
}));

import { POST } from "./route";

describe("POST /api/reports/generate", () => {
  beforeEach(() => {
    currentTenantMock.requireReadyTenant.mockReset();
    generatorMock.generateProjectReport.mockReset();
    currentTenantMock.requireReadyTenant.mockResolvedValue({ tenantId: TENANT_A_ID });
  });

  it("reportSettingId가 없으면 400을 반환한다", async () => {
    const request = new Request("http://localhost/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-1" }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    expect(generatorMock.generateProjectReport).not.toHaveBeenCalled();
  });

  it("유효한 요청이면 tenantId와 함께 생성 함수를 호출한다", async () => {
    generatorMock.generateProjectReport.mockResolvedValue({
      instanceId: "instance-1",
      downloadUrl: "/api/reports/instance-1/download",
      fileKey: "tenants/tenant-a/reports/generated/instance-1.docx",
    });

    const request = new Request("http://localhost/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "project-1",
        reportSettingId: "setting-1",
      }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(generatorMock.generateProjectReport).toHaveBeenCalledWith(TENANT_A_ID, "project-1", {
      templateId: undefined,
      reportSettingId: "setting-1",
    });
    expect(body.downloadUrl).toContain("/api/reports/instance-1/download");
  });

  it("생성 실패 시 실제 오류 메시지를 응답에 담는다", async () => {
    generatorMock.generateProjectReport.mockRejectedValue(new Error("보고서 캡처 이미지(훈련 안내 페이지)가 없습니다."));

    const request = new Request("http://localhost/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "project-1",
        reportSettingId: "setting-1",
      }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "보고서 캡처 이미지(훈련 안내 페이지)가 없습니다.",
    });
  });
});
