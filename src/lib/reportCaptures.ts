import type { Project } from "@shared/schema";
import type { TranslationKey } from "@/lib/i18n";

type ReportCaptureProjectKey = keyof Pick<
  Project,
  | "reportCaptureInboxFileKey"
  | "reportCaptureEmailFileKey"
  | "reportCaptureMaliciousFileKey"
  | "reportCaptureTrainingFileKey"
>;

export type ReportCaptureKey =
  | "capture_inbox"
  | "capture_email_body"
  | "capture_malicious_page"
  | "capture_training_page";

export const reportCaptureFields: Array<{
  key: ReportCaptureKey;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  projectField: ReportCaptureProjectKey;
}> = [
  {
    key: "capture_inbox",
    labelKey: "reports.capture.inbox.label",
    descriptionKey: "reports.capture.inbox.description",
    projectField: "reportCaptureInboxFileKey",
  },
  {
    key: "capture_email_body",
    labelKey: "reports.capture.emailBody.label",
    descriptionKey: "reports.capture.emailBody.description",
    projectField: "reportCaptureEmailFileKey",
  },
  {
    key: "capture_malicious_page",
    labelKey: "reports.capture.maliciousPage.label",
    descriptionKey: "reports.capture.maliciousPage.description",
    projectField: "reportCaptureMaliciousFileKey",
  },
  {
    key: "capture_training_page",
    labelKey: "reports.capture.trainingPage.label",
    descriptionKey: "reports.capture.trainingPage.description",
    projectField: "reportCaptureTrainingFileKey",
  },
];

export const getMissingReportCaptures = (project?: Project | null) =>
  reportCaptureFields.filter((field) => !project?.[field.projectField]);

export const hasAllReportCaptures = (project?: Project | null) =>
  getMissingReportCaptures(project).length === 0;
