import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_STORAGE_ROOT = path.join(process.cwd(), "storage");

export const REPORT_STORAGE_ROOT =
  process.env.REPORT_STORAGE_ROOT ?? DEFAULT_STORAGE_ROOT;

const buildTenantRoot = (tenantId: string) =>
  path.posix.join("tenants", tenantId);

export function buildTemplateFileKey(
  tenantId: string,
  templateId: string,
  version: string,
) {
  return path.posix.join(
    buildTenantRoot(tenantId),
    "reports",
    "templates",
    templateId,
    version,
    "template.docx",
  );
}

export function buildReportFileKey(
  tenantId: string,
  instanceId: string,
  extension: "docx" | "pdf" = "docx",
) {
  return path.posix.join(
    buildTenantRoot(tenantId),
    "reports",
    "generated",
    `${instanceId}.${extension}`,
  );
}

export function buildReportCaptureFileKey(
  tenantId: string,
  projectId: string,
  captureKey: string,
  extension: string,
) {
  const normalizedExt = extension.replace(/^\./, "");
  return path.posix.join(
    buildTenantRoot(tenantId),
    "reports",
    "captures",
    projectId,
    `${captureKey}.${normalizedExt}`,
  );
}

export function buildReportSettingLogoFileKey(
  tenantId: string,
  settingId: string,
  extension: string,
) {
  const normalizedExt = extension.replace(/^\./, "");
  return path.posix.join(
    buildTenantRoot(tenantId),
    "reports",
    "settings",
    settingId,
    `logo.${normalizedExt}`,
  );
}

export function resolveStoragePath(fileKey: string) {
  const normalizedKey = fileKey.replace(/^\/+/, "");
  const fullPath = path.join(REPORT_STORAGE_ROOT, normalizedKey);
  const rootPath = path.resolve(REPORT_STORAGE_ROOT);
  const resolvedPath = path.resolve(fullPath);
  if (!resolvedPath.startsWith(rootPath)) {
    throw new Error("허용되지 않은 저장 경로입니다.");
  }
  return resolvedPath;
}

export async function ensureDirectoryForFile(filePath: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
