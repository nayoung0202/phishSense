import { randomUUID } from "node:crypto";

export type TenantSmtpConfig = {
  tenantId: string;
  host: string;
  port: number;
  securityMode: "SMTPS" | "STARTTLS" | "NONE";
  username?: string | null;
  password?: string | null;
  tlsVerify: boolean;
  rateLimitPerMin: number;
  allowedSenderDomains: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string | null;
  lastTestStatus?: "success" | "failure" | null;
  lastTestError?: string | null;
};

export type InsertSmtpConfig = Omit<TenantSmtpConfig, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
};

export type UpsertTenantSmtpConfig = {
  tenantId: string;
  host: string;
  port: number;
  securityMode: "SMTPS" | "STARTTLS" | "NONE";
  username?: string | null;
  password?: string | null;
  tlsVerify: boolean;
  rateLimitPerMin: number;
  allowedSenderDomains?: string[];
  isActive: boolean;
};

export type SmtpTestLog = {
  id: string;
  tenantId: string;
  testRecipientEmail: string;
  success: boolean;
  errorMessage?: string | null;
  createdAt: string;
};

const smtpConfigs = new Map<string, TenantSmtpConfig>();
const smtpTestLogs: SmtpTestLog[] = [];

export async function getTenantSmtpConfig(tenantId: string): Promise<TenantSmtpConfig | null> {
  return smtpConfigs.get(tenantId) ?? null;
}

export async function listTenantSmtpConfigs(): Promise<TenantSmtpConfig[]> {
  return Array.from(smtpConfigs.values());
}

export async function upsertTenantSmtpConfig(payload: UpsertTenantSmtpConfig) {
  const now = new Date().toISOString();
  const existing = smtpConfigs.get(payload.tenantId);
  const record: TenantSmtpConfig = {
    tenantId: payload.tenantId,
    host: payload.host,
    port: payload.port,
    securityMode: payload.securityMode,
    username: payload.username ?? null,
    password: payload.password ?? existing?.password ?? null,
    tlsVerify: payload.tlsVerify,
    rateLimitPerMin: payload.rateLimitPerMin,
    allowedSenderDomains: payload.allowedSenderDomains
      ? Array.from(
          new Set(payload.allowedSenderDomains.map((domain) => domain.trim().toLowerCase())),
        )
      : existing?.allowedSenderDomains ?? [],
    isActive: payload.isActive,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastTestedAt: existing?.lastTestedAt ?? null,
    lastTestStatus: existing?.lastTestStatus ?? null,
    lastTestError: existing?.lastTestError ?? null,
  };

  smtpConfigs.set(payload.tenantId, record);
  return record;
}

export async function insertSmtpTestLog(log: Omit<SmtpTestLog, "id" | "createdAt">) {
  smtpTestLogs.push({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...log,
  });
}

export async function updateLastSmtpTestResult(options: {
  tenantId: string;
  success: boolean;
  errorMessage?: string | null;
}) {
  const existing = smtpConfigs.get(options.tenantId);
  if (!existing) return;
  existing.lastTestedAt = new Date().toISOString();
  existing.lastTestStatus = options.success ? "success" : "failure";
  existing.lastTestError = options.errorMessage ?? null;
}
