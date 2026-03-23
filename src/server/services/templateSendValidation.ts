import type { Project, Template, TrainingPage } from "@shared/schema";
import {
  extractTemplateTokens,
  findUnknownTokens,
  countTokenOccurrences,
  MAIL_ALLOWED_TOKENS,
  MAIL_LANDING_TOKENS,
  MALICIOUS_ALLOWED_TOKENS,
  MALICIOUS_TRAINING_TOKENS,
} from "@shared/templateTokens";
import type { PersistedSmtpConfig } from "../dao/smtpDao";
import { collectRuntimeSendConfigIssues } from "./runtimeSmtpConfig";
export {
  buildMailHtml,
  type MailAutoInsertConfig,
  type MailBuildResult,
  resolveAutoInsertConfig,
  buildAutoInsertBlock,
} from "@shared/templateMail";

export type SendValidationIssue = {
  code:
    | "template_missing"
    | "training_page_missing"
    | "mail_missing_landing_token"
    | "mail_unknown_tokens"
    | "malicious_unknown_tokens"
    | "malicious_content_missing"
    | "malicious_missing_training_token"
    | "smtp_not_configured"
    | "smtp_inactive"
    | "smtp_password_missing"
    | "sender_name_missing"
    | "sender_email_missing"
    | "sender_email_invalid"
    | "sender_domain_not_allowed";
  scope: "project" | "mail" | "malicious";
  message: string;
  tokens?: string[];
};

export type SendValidationResult = {
  ok: boolean;
  issues: SendValidationIssue[];
};

export class SendValidationError extends Error {
  issues: SendValidationIssue[];

  constructor(issues: SendValidationIssue[]) {
    super("send_validation_failed");
    this.name = "SendValidationError";
    this.issues = issues;
  }
}


export const validateTemplateForSend = (
  template: Template,
  trainingPage: TrainingPage | null | undefined,
): SendValidationResult => {
  const issues: SendValidationIssue[] = [];

  const mailTokens = extractTemplateTokens(template.body ?? "");
  const unknownMailTokens = findUnknownTokens(mailTokens, MAIL_ALLOWED_TOKENS);
  if (unknownMailTokens.length > 0) {
    issues.push({
      code: "mail_unknown_tokens",
      scope: "mail",
      tokens: unknownMailTokens,
      message: `메일 본문에 허용되지 않은 토큰이 포함되어 있습니다: ${unknownMailTokens.join(", ")}`,
    });
  }

  const landingTokenCount = countTokenOccurrences(template.body ?? "", MAIL_LANDING_TOKENS);
  if (landingTokenCount === 0) {
    issues.push({
      code: "mail_missing_landing_token",
      scope: "mail",
      message: "메일 본문에 LANDING_URL 토큰이 없습니다.",
    });
  }

  const maliciousContent = template.maliciousPageContent?.trim() ?? "";
  if (!maliciousContent) {
    issues.push({
      code: "malicious_content_missing",
      scope: "malicious",
      message: "악성 메일 본문이 비어 있습니다.",
    });
  }

  const maliciousTokens = extractTemplateTokens(maliciousContent);
  const unknownMaliciousTokens = findUnknownTokens(maliciousTokens, MALICIOUS_ALLOWED_TOKENS);
  if (unknownMaliciousTokens.length > 0) {
    issues.push({
      code: "malicious_unknown_tokens",
      scope: "malicious",
      tokens: unknownMaliciousTokens,
      message: `악성 본문에 허용되지 않은 토큰이 포함되어 있습니다: ${unknownMaliciousTokens.join(", ")}`,
    });
  }

  const trainingTokenCount = countTokenOccurrences(
    maliciousContent,
    MALICIOUS_TRAINING_TOKENS,
  );

  if (trainingTokenCount === 0) {
    issues.push({
      code: "malicious_missing_training_token",
      scope: "malicious",
      message: "악성 본문에 TRAINING_URL 토큰이 없습니다.",
    });
  }

  if (!trainingPage) {
    issues.push({
      code: "training_page_missing",
      scope: "project",
      message: "훈련 안내 페이지가 연결되어 있지 않습니다.",
    });
  }

  return { ok: issues.length === 0, issues };
};

export const formatSendValidationError = (issues: SendValidationIssue[]) =>
  issues.map((issue) => issue.message).join("\n");

export const validateProjectRuntimeSendConfig = (
  project: Pick<Project, "fromName" | "fromEmail">,
  smtpConfig?: PersistedSmtpConfig | null,
): SendValidationIssue[] => {
  return collectRuntimeSendConfigIssues(project, smtpConfig).map((issue) => ({
    ...issue,
    scope: "project",
  }));
};

type ValidationStorage = {
  getTemplate(id: string): Promise<Template | undefined>;
  getTrainingPage(id: string): Promise<TrainingPage | undefined>;
  getSmtpConfig?(): Promise<PersistedSmtpConfig | null>;
};

export const validateProjectForSend = async (
  storage: ValidationStorage,
  project: Project,
): Promise<SendValidationResult> => {
  if (!project.templateId) {
    return {
      ok: false,
      issues: [
        {
          code: "template_missing",
          scope: "project",
          message: "프로젝트에 템플릿이 연결되어 있지 않습니다.",
        },
      ],
    };
  }

  const [template, trainingPage, smtpConfig] = await Promise.all([
    storage.getTemplate(project.templateId),
    project.trainingPageId ? storage.getTrainingPage(project.trainingPageId) : Promise.resolve(undefined),
    storage.getSmtpConfig ? storage.getSmtpConfig() : Promise.resolve(null),
  ]);

  if (!template) {
    return {
      ok: false,
      issues: [
        {
          code: "template_missing",
          scope: "project",
          message: "템플릿을 찾을 수 없습니다.",
        },
      ],
    };
  }

  const templateValidation = validateTemplateForSend(template, trainingPage);
  const runtimeIssues = validateProjectRuntimeSendConfig(project, smtpConfig);
  const issues = [...templateValidation.issues, ...runtimeIssues];
  return { ok: issues.length === 0, issues };
};
