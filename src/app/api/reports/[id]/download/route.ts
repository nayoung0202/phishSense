import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { format } from "date-fns";
import {
  getProjectForTenant,
  getReportInstanceForTenant,
} from "@/server/tenant/tenantStorage";
import {
  buildReadyTenantErrorResponse,
  requireReadyTenant,
} from "@/server/tenant/currentTenant";
import { fileExists, resolveStoragePath } from "@/server/services/reportStorage";

export const runtime = "nodejs";

const COMPANY_NAME_ENV = "REPORT_COMPANY_NAME";

const sanitizeFilename = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").trim();

const toAsciiFilename = (value: string) =>
  sanitizeFilename(value)
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const getDownloadMetadata = (fileKey: string) => {
  const extension = path.extname(fileKey).toLowerCase();
  if (extension === ".pdf") {
    return {
      contentType: "application/pdf",
      extension: "pdf",
    };
  }
  return {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  };
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId } = await requireReadyTenant(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "보고서 ID가 없습니다." }, { status: 400 });
    }

    const instance = await getReportInstanceForTenant(tenantId, id);
    if (!instance || instance.status !== "completed" || !instance.fileKey) {
      return NextResponse.json({ error: "보고서 파일이 준비되지 않았습니다." }, { status: 404 });
    }

    const filePath = resolveStoragePath(instance.fileKey);
    if (!(await fileExists(filePath))) {
      return NextResponse.json({ error: "보고서 파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const buffer = await fs.readFile(filePath);
    const companyName = (process.env[COMPANY_NAME_ENV] ?? "").trim();
    const project = await getProjectForTenant(tenantId, instance.projectId);
    const projectName = project?.name ?? "project";
    const date = instance.completedAt ? new Date(instance.completedAt) : new Date();
    const formatted = format(date, "yyyyMMdd");
    const rawCompany = companyName || "company";
    const rawProject = projectName || "project";
    const downloadMetadata = getDownloadMetadata(instance.fileKey);
    const rawFilename = `${rawCompany}_${rawProject}_보고서_${formatted}.${downloadMetadata.extension}`;
    const asciiFilename =
      toAsciiFilename(`${rawCompany}_${rawProject}_report_${formatted}.${downloadMetadata.extension}`) ||
      `report-${id}.${downloadMetadata.extension}`;
    const encodedFilename = encodeURIComponent(rawFilename);
    const contentDisposition =
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": downloadMetadata.contentType,
        "Content-Disposition": contentDisposition,
      },
    });
  } catch (error) {
    return buildReadyTenantErrorResponse(error, "보고서 다운로드에 실패했습니다.");
  }
}
