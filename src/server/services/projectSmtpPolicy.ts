import type { InsertProject, Project } from "@shared/schema";
import { validateSenderEmailAgainstAllowedDomains } from "@/lib/smtpValidation";
import { getSmtpConfigByIdForTenant } from "@/server/dao/smtpDao";
import {
  STATUS_TEMP,
  normalizeOptionalString,
  type ProjectValidationIssue,
} from "./projectsShared";

type ProjectSenderPolicyTarget = Pick<InsertProject | Project, "status" | "smtpAccountId" | "fromEmail">;

export async function validateProjectSenderDomainPolicy(
  tenantId: string,
  project: ProjectSenderPolicyTarget,
): Promise<ProjectValidationIssue[]> {
  if (project.status === STATUS_TEMP) {
    return [];
  }

  const smtpAccountId = normalizeOptionalString(project.smtpAccountId);
  const fromEmail = normalizeOptionalString(project.fromEmail);

  if (!smtpAccountId || !fromEmail) {
    return [];
  }

  const smtpConfig = await getSmtpConfigByIdForTenant(tenantId, smtpAccountId);
  if (!smtpConfig) {
    return [
      {
        field: "smtpAccountId",
        code: "not_found",
        message: "선택한 발송 설정을 찾을 수 없습니다.",
      },
    ];
  }

  try {
    validateSenderEmailAgainstAllowedDomains(
      fromEmail,
      smtpConfig.allowedSenderDomains,
      "발신 이메일",
    );
    return [];
  } catch (error) {
    return [
      {
        field: "fromEmail",
        code: error instanceof Error && error.message === "유효한 이메일 주소를 입력하세요."
          ? "invalid"
          : "sender_domain_not_allowed",
        message:
          error instanceof Error
            ? error.message
            : "발신 이메일 도메인이 허용 발신 도메인과 일치하지 않습니다.",
      },
    ];
  }
}
