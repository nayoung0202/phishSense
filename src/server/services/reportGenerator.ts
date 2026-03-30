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
  getProjectsForTenant,
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
import { splitDepartmentEntries } from "./projectsShared";
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

const formatHeadCount = (count: number) => `${count}명`;

const formatCountWithRate = (count: number, total: number) =>
  `${formatHeadCount(count)} (${formatPercent(count, total)})`;

const formatSignedDelta = (value: number, suffix: "%" | "%p") => {
  const rounded = Number(value.toFixed(1));
  if (Object.is(rounded, -0)) {
    return `0.0${suffix}`;
  }
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toFixed(1)}${suffix}`;
};

const formatCountChangeRate = (current: number, previous: number) => {
  if (previous <= 0) return "-";
  return formatSignedDelta(((current - previous) / previous) * 100, "%");
};

const formatRatePointChange = (
  currentCount: number,
  currentTotal: number,
  previousCount: number,
  previousTotal: number,
) => {
  if (previousTotal <= 0) return "-";
  const currentRate = currentTotal > 0 ? (currentCount / currentTotal) * 100 : 0;
  const previousRate = (previousCount / previousTotal) * 100;
  return formatSignedDelta(currentRate - previousRate, "%p");
};

const hasDateValue = (value?: Date | string | null) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const resolveTargetResultState = (projectTarget: {
  status?: string | null;
  openedAt?: Date | string | null;
  clickedAt?: Date | string | null;
  submittedAt?: Date | string | null;
}) => {
  const submitted = hasDateValue(projectTarget.submittedAt) || projectTarget.status === "submitted";
  const clicked =
    submitted ||
    hasDateValue(projectTarget.clickedAt) ||
    projectTarget.status === "clicked";
  const opened =
    clicked ||
    hasDateValue(projectTarget.openedAt) ||
    projectTarget.status === "opened";

  return { opened, clicked, submitted };
};

const getPrimaryDepartment = (department?: string | null) =>
  splitDepartmentEntries(department)[0] ?? "미지정";

const getProjectMetricSnapshot = (project: Project) => {
  const targetCount = Math.max(0, project.targetCount ?? 0);
  const openCount = Math.max(0, project.openCount ?? 0);
  const clickCount = Math.max(0, project.clickCount ?? 0);
  const submitCount = Math.max(0, project.submitCount ?? 0);

  return {
    targetCount,
    openCount,
    clickCount,
    submitCount,
    targetCountLabel: formatHeadCount(targetCount),
    openCountLabel: formatCountWithRate(openCount, targetCount),
    clickCountLabel: formatCountWithRate(clickCount, targetCount),
    submitCountLabel: formatCountWithRate(submitCount, targetCount),
  };
};

const formatQuarterLabel = (year: number, quarter: number, includeYear: boolean) =>
  includeYear ? `${year}년 ${quarter}분기` : `${quarter}분기`;

const buildComparisonRows = (project: Project, previousProject?: Project | null) => {
  const currentMetrics = getProjectMetricSnapshot(project);
  const previousMetrics = previousProject ? getProjectMetricSnapshot(previousProject) : null;
  const currentYear = resolveReportYear(project);
  const currentQuarter = resolveReportQuarter(project);
  const previousYear =
    currentQuarter === 1 ? currentYear - 1 : resolveReportYear(previousProject ?? project);
  const previousQuarter =
    currentQuarter === 1 ? 4 : previousProject ? resolveReportQuarter(previousProject) : currentQuarter - 1;
  const includeYear = previousYear !== currentYear;
  const previousLabel = formatQuarterLabel(previousYear, previousQuarter, includeYear);
  const currentLabel = formatQuarterLabel(currentYear, currentQuarter, includeYear);

  const previousValue = (value: string) => (previousMetrics ? value : "-");
  const previousCountValue = (count: number, total: number) =>
    previousMetrics ? formatCountWithRate(count, total) : "-";

  return {
    comparisonPreviousLabel: previousLabel,
    comparisonCurrentLabel: currentLabel,
    comparisonRows: [
      {
        label: "훈련 대상 수",
        previous_value: previousValue(formatHeadCount(previousMetrics?.targetCount ?? 0)),
        current_value: currentMetrics.targetCountLabel,
        delta_value: previousMetrics
          ? formatCountChangeRate(currentMetrics.targetCount, previousMetrics.targetCount)
          : "-",
      },
      {
        label: "메일 열람",
        previous_value: previousCountValue(previousMetrics?.openCount ?? 0, previousMetrics?.targetCount ?? 0),
        current_value: currentMetrics.openCountLabel,
        delta_value: previousMetrics
          ? formatRatePointChange(
              currentMetrics.openCount,
              currentMetrics.targetCount,
              previousMetrics.openCount,
              previousMetrics.targetCount,
            )
          : "-",
      },
      {
        label: "링크 클릭",
        previous_value: previousCountValue(previousMetrics?.clickCount ?? 0, previousMetrics?.targetCount ?? 0),
        current_value: currentMetrics.clickCountLabel,
        delta_value: previousMetrics
          ? formatRatePointChange(
              currentMetrics.clickCount,
              currentMetrics.targetCount,
              previousMetrics.clickCount,
              previousMetrics.targetCount,
            )
          : "-",
      },
      {
        label: "개인정보 입력",
        previous_value: previousCountValue(previousMetrics?.submitCount ?? 0, previousMetrics?.targetCount ?? 0),
        current_value: currentMetrics.submitCountLabel,
        delta_value: previousMetrics
          ? formatRatePointChange(
              currentMetrics.submitCount,
              currentMetrics.targetCount,
              previousMetrics.submitCount,
              previousMetrics.targetCount,
            )
          : "-",
      },
    ],
  };
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
  const metrics = getProjectMetricSnapshot(project);

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
    target_count: metrics.targetCount,
    open_count: metrics.openCount,
    open_rate: formatPercent(metrics.openCount, metrics.targetCount),
    click_count: metrics.clickCount,
    click_rate: formatPercent(metrics.clickCount, metrics.targetCount),
    submit_count: metrics.submitCount,
    submit_rate: formatPercent(metrics.submitCount, metrics.targetCount),
    target_count_label: metrics.targetCountLabel,
    open_count_label: metrics.openCountLabel,
    click_count_label: metrics.clickCountLabel,
    submit_count_label: metrics.submitCountLabel,
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
  const previousComparisonProject = (() => {
    const currentYear = resolveReportYear(project);
    const currentQuarter = resolveReportQuarter(project);
    const targetYear = currentQuarter === 1 ? currentYear - 1 : currentYear;
    const targetQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;

    return getProjectsForTenant(tenantId).then((projects) =>
      projects
        .filter((candidate) => {
          if (candidate.id === project.id) return false;
          if (candidate.status !== "완료") return false;
          return (
            resolveReportYear(candidate) === targetYear &&
            resolveReportQuarter(candidate) === targetQuarter
          );
        })
        .sort(
          (a, b) =>
            new Date(b.endDate).getTime() - new Date(a.endDate).getTime(),
        )[0] ?? null,
    );
  })();

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
  const detailRowsRaw = await Promise.all(
    projectTargets.map(async (target) => {
      const detail = await getTargetForTenant(tenantId, target.targetId);
      const state = resolveTargetResultState(target);
      return {
        department: getPrimaryDepartment(detail?.department),
        name: detail?.name ?? "-",
        email: detail?.email ?? "-",
        opened: state.opened ? "O" : "X",
        clicked: state.clicked ? "O" : "X",
        submitted: state.submitted ? "O" : "X",
      };
    }),
  );
  const detailRows =
    detailRowsRaw.length > 0
      ? detailRowsRaw.map(({ department: _department, ...row }) => row)
      : [{ name: "-", email: "-", opened: "-", clicked: "-", submitted: "-" }];

  const departmentMap = new Map<
    string,
    {
      targetCount: number;
      openCount: number;
      clickCount: number;
      submitCount: number;
    }
  >();

  detailRowsRaw.forEach((row) => {
    const current = departmentMap.get(row.department) ?? {
      targetCount: 0,
      openCount: 0,
      clickCount: 0,
      submitCount: 0,
    };
    current.targetCount += 1;
    current.openCount += row.opened === "O" ? 1 : 0;
    current.clickCount += row.clicked === "O" ? 1 : 0;
    current.submitCount += row.submitted === "O" ? 1 : 0;
    departmentMap.set(row.department, current);
  });

  const departmentRows =
    departmentMap.size > 0
      ? Array.from(departmentMap.entries())
          .sort(([left], [right]) => left.localeCompare(right, "ko"))
          .map(([departmentName, counts]) => ({
            department: departmentName,
            target_count_label: formatHeadCount(counts.targetCount),
            open_count_label: formatCountWithRate(counts.openCount, counts.targetCount),
            click_count_label: formatCountWithRate(counts.clickCount, counts.targetCount),
            submit_count_label: formatCountWithRate(counts.submitCount, counts.targetCount),
          }))
      : [
          {
            department: "-",
            target_count_label: formatHeadCount(0),
            open_count_label: formatCountWithRate(0, 0),
            click_count_label: formatCountWithRate(0, 0),
            submit_count_label: formatCountWithRate(0, 0),
          },
        ];

  const comparisonData = buildComparisonRows(project, await previousComparisonProject);

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
        department_rows: departmentRows,
        comparison_previous_label: comparisonData.comparisonPreviousLabel,
        comparison_current_label: comparisonData.comparisonCurrentLabel,
        comparison_rows: comparisonData.comparisonRows,
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
