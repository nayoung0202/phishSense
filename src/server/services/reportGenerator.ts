import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import type { Project, ReportTemplate } from "@shared/schema";
import {
  createReportInstanceForTenant,
  createReportTemplateForTenant,
  getActiveReportTemplateInTenant,
  getProjectForTenant,
  getProjectTargetsForTenant,
  getReportSettingForTenant,
  getReportTemplateForTenant,
  getTargetForTenant,
  getTemplateForTenant,
  updateReportInstanceForTenantScope,
} from "@/server/tenant/tenantStorage";
import {
  buildReportFileKey,
  buildTemplateFileKey,
  ensureDirectoryForFile,
  fileExists,
  resolveStoragePath,
} from "./reportStorage";
import { resolveReportPythonBin } from "./reportPythonRuntime";

const PYTHON_SCRIPT = path.join(process.cwd(), "scripts", "report", "generate_report.py");
const DEFAULT_TEMPLATE_PATH =
  process.env.REPORT_DEFAULT_TEMPLATE_PATH ??
  path.join(process.cwd(), "attached_assets", "default_report_template.docx");
const CONFIDENTIAL_LOGO_ENV = "REPORT_CONFIDENTIAL_LOGO_PATH";
const DEFAULT_CONFIDENTIAL_LOGO_PATH = path.join(
  process.cwd(),
  "attached_assets",
  "confidential_logo.png",
);

const formatDate = (value?: Date | string | null, pattern = "yyyy-MM-dd") => {
  if (!value) return "";
  return format(new Date(value), pattern);
};

const formatDateDot = (value?: Date | string | null) => formatDate(value, "yyyy.MM.dd");

const formatPercent = (count: number, total: number) => {
  if (!total || total <= 0) return "0%";
  const percent = (count / total) * 100;
  return `${percent.toFixed(1)}%`;
};

const buildReportData = (
  project: Project,
  options: {
    companyName: string;
    approverName: string;
    approverTitle: string;
    reportYear: number;
    reportQuarter: number;
    reportMonth: string;
    reportDate: string;
    scenarioTitle: string;
    emailSubject: string;
  },
) => {
  const targetCount = Math.max(0, project.targetCount ?? 0);
  const openCount = Math.max(0, project.openCount ?? 0);
  const clickCount = Math.max(0, project.clickCount ?? 0);
  const submitCount = Math.max(0, project.submitCount ?? 0);
  const openLabel = `${openCount}명 (${formatPercent(openCount, targetCount)})`;
  const clickLabel = `${clickCount}명 (${formatPercent(clickCount, targetCount)})`;
  const submitLabel = `${submitCount}명 (${formatPercent(submitCount, targetCount)})`;

  return {
    company_name: options.companyName,
    project_name: project.name ?? "",
    period_start: formatDate(project.startDate),
    period_end: formatDate(project.endDate),
    period_start_dot: formatDateDot(project.startDate),
    period_end_dot: formatDateDot(project.endDate),
    report_year: options.reportYear,
    report_quarter: options.reportQuarter,
    report_month: options.reportMonth,
    report_date: options.reportDate,
    owner_name: project.fromName ?? project.fromEmail ?? "",
    approver_name: options.approverName,
    approver_title: options.approverTitle,
    department: project.department ?? "",
    description: project.description ?? "",
    target_count: targetCount,
    open_count: openCount,
    open_rate: formatPercent(openCount, targetCount),
    click_count: clickCount,
    click_rate: formatPercent(clickCount, targetCount),
    submit_count: submitCount,
    submit_rate: formatPercent(submitCount, targetCount),
    target_count_label: `${targetCount}명`,
    open_count_label: openLabel,
    click_count_label: clickLabel,
    submit_count_label: submitLabel,
    scenario_title: options.scenarioTitle,
    email_subject: options.emailSubject,
    summary: project.description ?? "",
    recommendation: "",
    next_steps: "",
  };
};

const runPythonRenderer = async (payload: object) => {
  if (!(await fileExists(PYTHON_SCRIPT))) {
    throw new Error("보고서 렌더러 스크립트를 찾을 수 없습니다.");
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(resolveReportPythonBin(), [PYTHON_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || "보고서 생성에 실패했습니다."));
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
};

const ensureDefaultTemplate = async (
  tenantId: string,
): Promise<ReportTemplate | undefined> => {
  const defaultExists = await fileExists(DEFAULT_TEMPLATE_PATH);
  if (!defaultExists) return undefined;

  const templateId = randomUUID();
  const version = "v1";
  const fileKey = buildTemplateFileKey(tenantId, templateId, version);
  const destinationPath = resolveStoragePath(fileKey);

  await ensureDirectoryForFile(destinationPath);
  await fs.copyFile(DEFAULT_TEMPLATE_PATH, destinationPath);

  return createReportTemplateForTenant(
    tenantId,
    {
      name: "기본 보고서 템플릿",
      version,
      fileKey,
    },
    { activate: true, id: templateId },
  );
};

type ResolvedReportTemplate = {
  template: ReportTemplate;
  templatePath: string;
};

const resolveTemplate = async (
  tenantId: string,
  templateId?: string | null,
): Promise<ResolvedReportTemplate> => {
  if (templateId) {
    const template = await getReportTemplateForTenant(tenantId, templateId);
    if (!template) {
      throw new Error("요청한 보고서 템플릿을 찾을 수 없습니다.");
    }
    return {
      template,
      templatePath: resolveStoragePath(template.fileKey),
    };
  }

  const active = await getActiveReportTemplateInTenant(tenantId);
  if (await fileExists(DEFAULT_TEMPLATE_PATH)) {
    if (active) {
      return {
        template: active,
        templatePath: DEFAULT_TEMPLATE_PATH,
      };
    }

    const defaultTemplate = await ensureDefaultTemplate(tenantId);
    if (defaultTemplate) {
      return {
        template: defaultTemplate,
        templatePath: DEFAULT_TEMPLATE_PATH,
      };
    }
  }

  if (active) {
    const activePath = resolveStoragePath(active.fileKey);
    if (await fileExists(activePath)) {
      return {
        template: active,
        templatePath: activePath,
      };
    }

    throw new Error("활성화된 보고서 템플릿 파일이 존재하지 않습니다.");
  }

  const defaultTemplate = await ensureDefaultTemplate(tenantId);
  if (defaultTemplate) {
    return {
      template: defaultTemplate,
      templatePath: resolveStoragePath(defaultTemplate.fileKey),
    };
  }

  throw new Error("활성화된 보고서 템플릿이 없습니다.");
};

const resolveReportSettingConfig = async (
  tenantId: string,
  reportSettingId?: string | null,
) => {
  if (!reportSettingId) {
    throw new Error("보고서 설정 ID가 필요합니다.");
  }

  const reportSetting = await getReportSettingForTenant(tenantId, reportSettingId);
  if (!reportSetting) {
    throw new Error("보고서 설정을 찾을 수 없습니다.");
  }

  const logoPath = resolveStoragePath(reportSetting.companyLogoFileKey);
  if (!(await fileExists(logoPath))) {
    throw new Error("선택한 보고서 설정의 로고 파일을 찾을 수 없습니다.");
  }

  const confidentialRaw = (process.env[CONFIDENTIAL_LOGO_ENV] ?? "").trim();
  const confidentialPath = confidentialRaw
    ? path.isAbsolute(confidentialRaw)
      ? confidentialRaw
      : path.join(process.cwd(), confidentialRaw)
    : DEFAULT_CONFIDENTIAL_LOGO_PATH;
  if (!(await fileExists(confidentialPath))) {
    throw new Error("대외비 로고 파일을 찾을 수 없습니다.");
  }
  return {
    companyName: reportSetting.companyName,
    approverName: reportSetting.approverName,
    approverTitle: reportSetting.approverTitle ?? "",
    logoPath,
    confidentialPath,
    reportSettingId: reportSetting.id,
  };
};

const resolveReportYear = (project: Project) =>
  project.fiscalYear ?? new Date(project.startDate).getFullYear();

const resolveReportQuarter = (project: Project) => {
  if (project.fiscalQuarter) return project.fiscalQuarter;
  const start = new Date(project.startDate);
  return Math.floor(start.getMonth() / 3) + 1;
};

export async function generateProjectReport(
  tenantId: string,
  projectId: string,
  options?: { templateId?: string | null; reportSettingId?: string | null },
) {
  const project = await getProjectForTenant(tenantId, projectId);
  if (!project) {
    throw new Error("프로젝트 정보를 찾을 수 없습니다.");
  }

  const { companyName, approverName, approverTitle, logoPath, confidentialPath, reportSettingId } =
    await resolveReportSettingConfig(tenantId, options?.reportSettingId ?? null);
  const { template, templatePath } = await resolveTemplate(tenantId, options?.templateId ?? null);
  if (!(await fileExists(templatePath))) {
    throw new Error("보고서 템플릿 파일이 존재하지 않습니다.");
  }

  const captureDefinitions = [
    {
      key: "capture_inbox",
      label: "메일 수신함",
      fileKey: project.reportCaptureInboxFileKey,
    },
    {
      key: "capture_email_body",
      label: "메일 본문",
      fileKey: project.reportCaptureEmailFileKey,
    },
    {
      key: "capture_malicious_page",
      label: "악성 페이지",
      fileKey: project.reportCaptureMaliciousFileKey,
    },
    {
      key: "capture_training_page",
      label: "훈련 안내 페이지",
      fileKey: project.reportCaptureTrainingFileKey,
    },
  ];

  const captureImages = await Promise.all(
    captureDefinitions.map(async (capture) => {
      if (!capture.fileKey) {
        throw new Error(`보고서 캡처 이미지(${capture.label})가 없습니다.`);
      }
      const capturePath = resolveStoragePath(capture.fileKey);
      if (!(await fileExists(capturePath))) {
        throw new Error(`보고서 캡처 이미지(${capture.label}) 파일을 찾을 수 없습니다.`);
      }
      return { key: capture.key, path: capturePath };
    }),
  );

  const templateRecord = project.templateId
    ? await getTemplateForTenant(tenantId, project.templateId)
    : undefined;

  const reportInstance = await createReportInstanceForTenant(tenantId, {
    projectId: project.id,
    templateId: template.id,
    reportSettingId,
    status: "pending",
    fileKey: null,
    errorMessage: null,
  });

  const reportFileKey = buildReportFileKey(tenantId, reportInstance.id);
  const outputPath = resolveStoragePath(reportFileKey);
  await ensureDirectoryForFile(outputPath);

  const targetCount = Math.max(0, project.targetCount ?? 0);
  const openCount = Math.max(0, project.openCount ?? 0);
  const clickCount = Math.max(0, project.clickCount ?? 0);
  const submitCount = Math.max(0, project.submitCount ?? 0);
  const openMissing = Math.max(targetCount - openCount, 0);
  const clickMissing = Math.max(targetCount - clickCount, 0);
  const submitMissing = Math.max(targetCount - submitCount, 0);

  const projectTargets = await getProjectTargetsForTenant(tenantId, project.id);
  const detailRows = await Promise.all(
    projectTargets.map(async (target) => {
      const detail = await getTargetForTenant(tenantId, target.targetId);
      const opened = target.status === "opened" || target.status === "clicked" || target.status === "submitted";
      const clicked = target.status === "clicked" || target.status === "submitted";
      const submitted = target.status === "submitted";
      return {
        name: detail?.name ?? "-",
        email: detail?.email ?? "-",
        opened: opened ? "O" : "X",
        clicked: clicked ? "O" : "X",
        submitted: submitted ? "O" : "X",
      };
    }),
  );

  try {
    await runPythonRenderer({
      template_path: templatePath,
      output_path: outputPath,
      data: {
        ...buildReportData(project, {
          companyName,
          approverName,
          approverTitle,
          reportYear: resolveReportYear(project),
          reportQuarter: resolveReportQuarter(project),
          reportMonth: formatDate(project.endDate, "yyyy.MM"),
          reportDate: formatDateDot(new Date()),
          scenarioTitle: templateRecord?.name ?? project.name ?? "",
          emailSubject: templateRecord?.subject ?? project.name ?? "",
        }),
        detail_rows: detailRows,
      },
      images: [
        {
          key: "confidential_logo",
          path: confidentialPath,
          width_cm: 4.05,
          height_cm: 1.59,
        },
        {
          key: "company_logo",
          path: logoPath,
          width_cm: 4.05,
          height_cm: 1.59,
        },
        ...captureImages.map((capture) => ({
          key: capture.key,
          path: capture.path,
          width_cm: 16.5,
        })),
      ],
      charts: [
        {
          key: "summary_bar_chart",
          type: "bar",
          labels: ["메일 발송", "메일 열람", "링크 클릭", "개인정보 입력"],
          values: [targetCount, openCount, clickCount, submitCount],
          width_cm: 13.5,
          height_cm: 5,
          colors: ["#4EC3E0", "#7C9CF5", "#F59E0B", "#F97316"],
        },
        {
          key: "open_donut_chart",
          labels: ["메일 열람", "메일 미열람"],
          values: [openCount, openMissing],
          width_cm: 13.5,
          height_cm: 5,
          colors: ["#4EC3E0", "#CBD5F5"],
        },
        {
          key: "click_donut_chart",
          labels: ["링크 클릭", "링크 미클릭"],
          values: [clickCount, clickMissing],
          width_cm: 13.5,
          height_cm: 5,
          colors: ["#7C9CF5", "#D1D5DB"],
        },
        {
          key: "submit_donut_chart",
          labels: ["개인정보 입력", "개인정보 미입력"],
          values: [submitCount, submitMissing],
          width_cm: 13.5,
          height_cm: 5,
          colors: ["#F59E0B", "#FDE68A"],
        },
      ],
    });

    await updateReportInstanceForTenantScope(tenantId, reportInstance.id, {
      status: "completed",
      fileKey: reportFileKey,
      completedAt: new Date(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "보고서 생성에 실패했습니다.";
    await updateReportInstanceForTenantScope(tenantId, reportInstance.id, {
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
    });
    throw new Error(message);
  }

  return {
    instanceId: reportInstance.id,
    downloadUrl: `/api/reports/${reportInstance.id}/download`,
    fileKey: reportFileKey,
  };
}
