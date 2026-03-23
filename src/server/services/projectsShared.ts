import process from "node:process";
import nodemailer from "nodemailer";
import { insertProjectSchema, type InsertProject, type Project } from "@shared/schema";
import { getProjectDepartmentDisplay } from "@shared/projectDepartment";
import { z } from "zod";

export const STATUS_RUNNING = "\uC9C4\uD589\uC911";
export const STATUS_SCHEDULED = "\uC608\uC57D";
export const STATUS_DONE = "\uC644\uB8CC";
export const STATUS_TEMP = "\uC784\uC2DC";

export const statusParamMap: Record<string, string> = {
  running: STATUS_RUNNING,
  inprogress: STATUS_RUNNING,
  "in-progress": STATUS_RUNNING,
  "\uC9C4\uD589\uC911": STATUS_RUNNING,
  scheduled: STATUS_SCHEDULED,
  "\uC608\uC57D": STATUS_SCHEDULED,
  done: STATUS_DONE,
  completed: STATUS_DONE,
  "\uC644\uB8CC": STATUS_DONE,
  temp: STATUS_TEMP,
  temporary: STATUS_TEMP,
  draft: STATUS_TEMP,
  "\uC784\uC2DC": STATUS_TEMP,
};

export const quarterNumbers = [1, 2, 3, 4] as const;

export const calculateRate = (count: number | null | undefined, total: number | null | undefined) => {
  if (!total || total <= 0 || !count) return 0;
  return Math.round((count / total) * 100);
};

export const toISO = (value: Date) => value.toISOString();

export const normalizeProjectDate = (date: Project["startDate"]) => {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    now.setMilliseconds(0);
    return now;
  }
  return parsed;
};

export const shouldStartScheduledProject = (project: Project, now = new Date()) => {
  if (project.status !== STATUS_SCHEDULED) return false;
  const startDate = normalizeProjectDate(project.startDate);
  return startDate.getTime() <= now.getTime();
};

export const shouldCompleteProject = (project: Project, now = new Date()) => {
  if (project.status === STATUS_DONE || project.status === STATUS_TEMP) return false;
  const endDate = normalizeProjectDate(project.endDate);
  return endDate.getTime() <= now.getTime();
};


export const projectOverlaps = (project: Project, rangeStart: Date, rangeEnd: Date) => {
  const projectStart = normalizeProjectDate(project.startDate);
  const projectEnd = normalizeProjectDate(project.endDate);
  return projectStart <= rangeEnd && projectEnd >= rangeStart;
};

export const summarizeProject = (project: Project) => ({
  id: project.id,
  name: project.name,
  status: project.status,
  department: getProjectDepartmentDisplay(project, ""),
  startDate: toISO(normalizeProjectDate(project.startDate)),
  endDate: toISO(normalizeProjectDate(project.endDate)),
  targetCount: project.targetCount ?? 0,
  openCount: project.openCount ?? 0,
  clickCount: project.clickCount ?? 0,
  submitCount: project.submitCount ?? 0,
  weekOfYear: project.weekOfYear ?? [],
});

const projectCreateBaseSchema = insertProjectSchema.omit({
  trainingLinkToken: true,
});

export const projectCreateSchema = projectCreateBaseSchema.extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  targetIds: z.array(z.string().trim().min(1)).default([]),
});

export type PreviewDepartmentSlice = {
  department: string;
  count: number;
};

export type PreviewTrendPoint = {
  label: string;
  metric: "count" | "rate";
  value: number;
};

export type PreviewForecast = {
  openRate: number;
  clickRate: number;
  submitRate: number;
};

export type PreviewTargetSample = {
  id: string;
  name: string;
  email: string;
  department: string;
  status: "\uC608\uC815";
};

export type PreviewConflict = {
  projectId: string;
  projectName: string;
  status: string;
};

export type PreviewResponse = {
  targetCount: number;
  departmentBreakdown: PreviewDepartmentSlice[];
  forecast: PreviewForecast;
  trend: PreviewTrendPoint[];
  sampleTargets: PreviewTargetSample[];
  conflicts: PreviewConflict[];
  generatedAt: string;
  cacheKey: string;
};

export type ProjectValidationIssue = {
  field: string;
  code: string;
  message: string;
};

type ValidateProjectPayloadOptions = {
  allowTemporaryDraft?: boolean;
};

export const PREVIEW_CACHE_WINDOW_MS = 2 * 60 * 1000;
export const previewCache = new Map<string, { data: PreviewResponse; expiresAt: number }>();
export const NODEMAILER_VERSION =
  (nodemailer as unknown as { version?: string }).version ?? "unknown";

export const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeOptionalString(entry)).filter(Boolean);
};

export const splitDepartmentEntries = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export const collectDepartmentTagsFromTargets = (
  targets: Array<{ department?: string | null }>,
) => {
  const departmentSet = new Set<string>();
  targets.forEach((target) => {
    splitDepartmentEntries(target.department).forEach((department) => {
      departmentSet.add(department);
    });
  });
  return Array.from(departmentSet).sort((a, b) => a.localeCompare(b, "ko"));
};

export const toSafeDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
};

export const previewRequestSchema = z.object({
  targetIds: z.array(z.string().trim().min(1)).default([]),
  templateId: z.string().trim().min(1).nullish(),
  startDate: z.string().trim().min(1).nullish(),
  endDate: z.string().trim().min(1).nullish(),
});

export const findMissingSmtpKey = () => {
  if (!process.env.SMTP_HOST) {
    return "SMTP_HOST";
  }
  if (!process.env.SMTP_USER) {
    return "SMTP_USER";
  }
  if (!process.env.SMTP_PASS) {
    return "SMTP_PASS";
  }
  return null;
};

export const stripHtml = (value: string) =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const buildTestEmailHtml = (htmlBody: string, recipient: string) => `
    <article style="font-family: 'Inter', 'Spoqa Han Sans Neo', sans-serif; line-height: 1.6; color: #0f172a; background: #f8fafc; padding: 24px;">
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        img { max-width: 100%; height: auto; display: block; }
        input, select, textarea, button { font: inherit; width: 100%; max-width: 100%; padding: 0.55rem 0.75rem; border-radius: 8px; border: 1px solid #cbd5f5; background-color: #ffffff; color: #0f172a; }
        label { display: block; margin-bottom: 0.35rem; font-weight: 600; }
        table { border-collapse: collapse; width: 100%; }
        a { color: #0284c7; text-decoration: underline; }
      </style>
      <header style="margin-bottom: 16px;">
        <p style="margin: 0; font-size: 14px; color: #64748b;">이 메일은 사전 점검을 위한 테스트 발송입니다.</p>
      </header>
      <section style="background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: rgba(15, 23, 42, 0.04) 0 10px 30px;">
        ${htmlBody}
      </section>
      <footer style="margin-top: 24px; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0;">수신자: ${recipient}</p>
        <p style="margin: 4px 0 0;">PhishSense 테스트 발송 메일입니다. 실사용자에게 자동 전송되지 않습니다.</p>
      </footer>
    </article>
  `;

export const buildPreviewCacheKey = (options: {
  projectId?: string | null;
  targetIds: string[];
  templateId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) => {
  const key = {
    projectId: options.projectId ?? null,
    targetIds: [...options.targetIds].sort(),
    templateId: options.templateId ?? null,
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
  };
  return JSON.stringify(key);
};

export const calculateProjectAverages = (projects: Project[]): PreviewForecast => {
  let totalTargets = 0;
  let openTotal = 0;
  let clickTotal = 0;
  let submitTotal = 0;

  projects.forEach((project) => {
    const targetCount = project.targetCount ?? 0;
    if (targetCount <= 0) {
      return;
    }
    totalTargets += targetCount;
    openTotal += project.openCount ?? 0;
    clickTotal += project.clickCount ?? 0;
    submitTotal += project.submitCount ?? 0;
  });

  if (totalTargets <= 0) {
    return {
      openRate: 0,
      clickRate: 0,
      submitRate: 0,
    };
  }

  const normalizeRate = (value: number) =>
    Math.min(100, Number(((value / totalTargets) * 100).toFixed(1)));

  return {
    openRate: normalizeRate(openTotal),
    clickRate: normalizeRate(clickTotal),
    submitRate: normalizeRate(submitTotal),
  };
};

export const buildPreviewTrend = (
  targetCount: number,
  forecast: PreviewForecast,
): PreviewTrendPoint[] => [
  { label: "발송", metric: "count", value: targetCount },
  { label: "오픈율", metric: "rate", value: forecast.openRate },
  { label: "클릭율", metric: "rate", value: forecast.clickRate },
  { label: "제출율", metric: "rate", value: forecast.submitRate },
];

export const validateProjectPayload = (
  payload: InsertProject,
  options: ValidateProjectPayloadOptions = {},
): ProjectValidationIssue[] => {
  const issues: ProjectValidationIssue[] = [];
  const isTemporaryDraft =
    options.allowTemporaryDraft && payload.status === STATUS_TEMP;

  if (!normalizeOptionalString(payload.name)) {
    issues.push({ field: "name", code: "required", message: "프로젝트명을 입력하세요." });
  }

  if (!isTemporaryDraft && !normalizeOptionalString(payload.templateId)) {
    issues.push({
      field: "templateId",
      code: "required",
      message: "템플릿을 선택하세요.",
    });
  }

  if (!isTemporaryDraft && !normalizeOptionalString(payload.trainingPageId)) {
    issues.push({
      field: "trainingPageId",
      code: "required",
      message: "훈련 안내 페이지를 선택하세요.",
    });
  }

  const smtpAccountId = normalizeOptionalString(payload.smtpAccountId);
  if (!isTemporaryDraft && !smtpAccountId) {
    issues.push({
      field: "smtpAccountId",
      code: "required",
      message: "발송 설정을 선택하세요.",
    });
  }

  const fromName = normalizeOptionalString(payload.fromName);
  if (!isTemporaryDraft && !fromName) {
    issues.push({
      field: "fromName",
      code: "required",
      message: "발신자 이름을 입력하세요.",
    });
  }

  const fromEmail = normalizeOptionalString(payload.fromEmail);
  if (!isTemporaryDraft && !fromEmail) {
    issues.push({
      field: "fromEmail",
      code: "required",
      message: "발신 이메일을 입력하세요.",
    });
  } else if (fromEmail && !fromEmail.includes("@")) {
    issues.push({
      field: "fromEmail",
      code: "invalid",
      message: "올바른 이메일 형식이 아닙니다.",
    });
  }

  const startDate = toSafeDate(payload.startDate);
  if (!startDate) {
    issues.push({
      field: "startDate",
      code: "required",
      message: "시작일을 입력하세요.",
    });
  }

  const endDate = toSafeDate(payload.endDate);
  const hasInvalidEndDateRange = isTemporaryDraft
    ? Boolean(startDate && endDate && startDate > endDate)
    : Boolean(startDate && endDate && startDate >= endDate);
  if (hasInvalidEndDateRange) {
    issues.push({
      field: "endDate",
      code: "invalid_range",
      message: "종료일은 시작일보다 늦어야 합니다.",
    });
  }

  if (payload.targetCount != null && payload.targetCount < 0) {
    issues.push({
      field: "targetCount",
      code: "invalid",
      message: "대상자 수는 0 이상이어야 합니다.",
    });
  }

  return issues;
};
