export const reportDownloadFormats = ["word", "pdf"] as const;

export type ReportDownloadFormat = (typeof reportDownloadFormats)[number];

export const DEFAULT_REPORT_DOWNLOAD_FORMAT: ReportDownloadFormat = "word";

export const isReportDownloadFormat = (
  value: string,
): value is ReportDownloadFormat =>
  reportDownloadFormats.includes(value as ReportDownloadFormat);

export const getReportFileExtension = (format: ReportDownloadFormat) =>
  format === "pdf" ? "pdf" : "docx";
