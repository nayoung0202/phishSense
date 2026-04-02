import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_REPORT_DOWNLOAD_FORMAT,
  reportDownloadFormats,
} from "@/lib/reportDownloadFormat";
import { generateProjectReport } from "@/server/services/reportGenerator";
import {
  buildReadyTenantErrorResponse,
  requireReadyTenant,
} from "@/server/tenant/currentTenant";

export const runtime = "nodejs";

const requestSchema = z.object({
  projectId: z.string().min(1, "프로젝트 ID가 필요합니다."),
  reportSettingId: z.string().min(1, "보고서 설정 ID가 필요합니다."),
  templateId: z.string().optional(),
  downloadFormat: z
    .enum(reportDownloadFormats)
    .optional()
    .default(DEFAULT_REPORT_DOWNLOAD_FORMAT),
});

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireReadyTenant(request);
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const result = await generateProjectReport(tenantId, parsed.data.projectId, {
      templateId: parsed.data.templateId,
      reportSettingId: parsed.data.reportSettingId,
      downloadFormat: parsed.data.downloadFormat,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[reports/generate] failed", error);
    const message = error instanceof Error ? error.message : "보고서 생성에 실패했습니다.";
    return buildReadyTenantErrorResponse(error, message);
  }
}
