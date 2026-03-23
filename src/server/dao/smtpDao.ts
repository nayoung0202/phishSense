import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { smtpAccountsTable, type SmtpAccountRow } from "../db/schema";
import { decryptSecret, encryptSecret, hasSmtpSecret } from "../utils/crypto";

export type SecurityMode = "SMTPS" | "STARTTLS" | "NONE";

export type PersistedSmtpConfig = {
  id: string;
  tenantId: string;
  name: string;
  host: string;
  port: number;
  securityMode: SecurityMode;
  username: string | null;
  password: string | null;
  tlsVerify: boolean;
  rateLimitPerMin: number;
  allowedSenderDomains: string[];
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestStatus: "success" | "failure" | null;
  lastTestError: string | null;
  hasPassword: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type PersistPayload = {
  name?: string | null;
  host: string;
  port: number;
  securityMode: SecurityMode;
  username?: string | null;
  password?: string | null;
  tlsVerify: boolean;
  rateLimitPerMin: number;
  allowedSenderDomains?: string[];
  isActive: boolean;
};

type CreatePersistPayload = PersistPayload & {
  id?: string;
  tenantId: string;
};

const parseAllowedDomains = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
};

const stringifyAllowedDomains = (domains?: string[]) =>
  JSON.stringify(
    Array.from(new Set(domains?.map((domain) => domain.trim().toLowerCase()).filter(Boolean) ?? [])),
  );

const normalizeStatus = (value?: string | null): "success" | "failure" | null => {
  if (value === "success" || value === "failure") {
    return value;
  }
  return null;
};

const toIsoString = (value?: Date | string | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeOptionalString = (value?: string | null) => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
};

const resolveConfigName = (payload: {
  name?: string | null;
  username?: string | null;
  host?: string | null;
  fallbackName?: string | null;
}) =>
  normalizeOptionalString(payload.name) ??
  normalizeOptionalString(payload.username) ??
  normalizeOptionalString(payload.host) ??
  normalizeOptionalString(payload.fallbackName) ??
  "발송 설정";

const mapRow = (row: SmtpAccountRow): PersistedSmtpConfig => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  host: row.host,
  port: row.port,
  securityMode: (row.securityMode as SecurityMode) ?? "STARTTLS",
  username: row.username ?? null,
  password: row.passwordEnc ? decryptSecret(row.passwordEnc) : null,
  tlsVerify: row.tlsVerify ?? true,
  rateLimitPerMin: row.rateLimitPerMin ?? 60,
  allowedSenderDomains: parseAllowedDomains(row.allowedDomainsJson),
  isActive: row.isActive ?? true,
  lastTestedAt: toIsoString(row.lastTestedAt),
  lastTestStatus: normalizeStatus(row.lastTestStatus),
  lastTestError: row.lastTestError ?? null,
  hasPassword: Boolean(row.passwordEnc),
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
});

export async function listSmtpConfigs(): Promise<PersistedSmtpConfig[]> {
  const rows = await db
    .select()
    .from(smtpAccountsTable)
    .orderBy(desc(smtpAccountsTable.updatedAt), desc(smtpAccountsTable.createdAt));
  return rows.map(mapRow);
}

export async function listSmtpConfigsForTenant(tenantId: string): Promise<PersistedSmtpConfig[]> {
  const rows = await db
    .select()
    .from(smtpAccountsTable)
    .where(eq(smtpAccountsTable.tenantId, tenantId))
    .orderBy(desc(smtpAccountsTable.updatedAt), desc(smtpAccountsTable.createdAt));
  return rows.map(mapRow);
}

async function getSmtpRowByIdForTenant(tenantId: string, smtpAccountId: string) {
  const rows = await db
    .select()
    .from(smtpAccountsTable)
    .where(
      and(
        eq(smtpAccountsTable.tenantId, tenantId),
        eq(smtpAccountsTable.id, smtpAccountId),
      ),
    )
    .limit(1);
  return rows[0];
}

async function getActiveSmtpRow(tenantId: string) {
  const rows = await db
    .select()
    .from(smtpAccountsTable)
    .where(and(eq(smtpAccountsTable.tenantId, tenantId), eq(smtpAccountsTable.isActive, true)))
    .orderBy(desc(smtpAccountsTable.updatedAt), desc(smtpAccountsTable.createdAt))
    .limit(1);
  return rows[0];
}

export async function getSmtpConfigByIdForTenant(
  tenantId: string,
  smtpAccountId: string,
): Promise<PersistedSmtpConfig | null> {
  const row = await getSmtpRowByIdForTenant(tenantId, smtpAccountId);
  return row ? mapRow(row) : null;
}

export async function getSmtpConfig(tenantId: string): Promise<PersistedSmtpConfig | null> {
  const row = await getActiveSmtpRow(tenantId);
  return row ? mapRow(row) : null;
}

export async function createSmtpConfig(payload: CreatePersistPayload): Promise<PersistedSmtpConfig> {
  const now = new Date();
  const encryptedPassword = payload.password ? encryptSecret(payload.password) : "";

  if (payload.password && !hasSmtpSecret()) {
    console.warn("[smtpDao] SMTP_SECRET가 설정되지 않아 개발용 임시 키를 사용합니다.");
  }

  const id = normalizeOptionalString(payload.id) ?? randomUUID();
  await db.insert(smtpAccountsTable).values({
    id,
    tenantId: payload.tenantId,
    name: resolveConfigName(payload),
    host: payload.host,
    port: payload.port,
    secure: payload.securityMode === "SMTPS",
    securityMode: payload.securityMode,
    username: payload.username ?? null,
    passwordEnc: encryptedPassword,
    tlsVerify: payload.tlsVerify,
    rateLimitPerMin: payload.rateLimitPerMin,
    allowedDomainsJson: stringifyAllowedDomains(payload.allowedSenderDomains),
    isActive: payload.isActive,
    createdAt: now,
    updatedAt: now,
  });

  const config = await getSmtpConfigByIdForTenant(payload.tenantId, id);
  if (!config) {
    throw new Error("발송 설정을 저장하지 못했습니다.");
  }
  return config;
}

export async function updateSmtpConfigForTenant(
  tenantId: string,
  smtpAccountId: string,
  payload: PersistPayload,
): Promise<PersistedSmtpConfig> {
  const existing = await getSmtpRowByIdForTenant(tenantId, smtpAccountId);
  if (!existing) {
    throw new Error("발송 설정을 찾지 못했습니다.");
  }

  const now = new Date();
  const encryptedPassword =
    payload.password !== undefined
      ? payload.password
        ? encryptSecret(payload.password)
        : ""
      : existing.passwordEnc ?? "";

  if (payload.password && !hasSmtpSecret()) {
    console.warn("[smtpDao] SMTP_SECRET가 설정되지 않아 개발용 임시 키를 사용합니다.");
  }

  await db
    .update(smtpAccountsTable)
    .set({
      name: resolveConfigName({
        ...payload,
        fallbackName: existing.name,
      }),
      host: payload.host,
      port: payload.port,
      secure: payload.securityMode === "SMTPS",
      securityMode: payload.securityMode,
      username: payload.username ?? null,
      passwordEnc: encryptedPassword,
      tlsVerify: payload.tlsVerify,
      rateLimitPerMin: payload.rateLimitPerMin,
      allowedDomainsJson:
        payload.allowedSenderDomains !== undefined
          ? stringifyAllowedDomains(payload.allowedSenderDomains)
          : existing.allowedDomainsJson ?? "[]",
      isActive: payload.isActive,
      updatedAt: now,
    })
    .where(
      and(
        eq(smtpAccountsTable.tenantId, tenantId),
        eq(smtpAccountsTable.id, smtpAccountId),
      ),
    );

  const config = await getSmtpConfigByIdForTenant(tenantId, smtpAccountId);
  if (!config) {
    throw new Error("발송 설정을 저장하지 못했습니다.");
  }
  return config;
}

export async function deactivateOtherSmtpConfigsForTenant(
  tenantId: string,
  activeSmtpAccountId: string,
) {
  await db
    .update(smtpAccountsTable)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(smtpAccountsTable.tenantId, tenantId),
        eq(smtpAccountsTable.isActive, true),
      ),
    );

  await db
    .update(smtpAccountsTable)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(smtpAccountsTable.tenantId, tenantId),
        eq(smtpAccountsTable.id, activeSmtpAccountId),
      ),
    );
}

export async function updateLastTestResult(options: {
  tenantId: string;
  smtpAccountId?: string | null;
  success: boolean;
  errorMessage?: string | null;
}) {
  const targetId =
    normalizeOptionalString(options.smtpAccountId) ??
    (await getActiveSmtpRow(options.tenantId))?.id ??
    null;
  if (!targetId) {
    return;
  }

  const now = new Date();
  await db
    .update(smtpAccountsTable)
    .set({
      lastTestedAt: now,
      lastTestStatus: options.success ? "success" : "failure",
      lastTestError: options.errorMessage ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(smtpAccountsTable.tenantId, options.tenantId),
        eq(smtpAccountsTable.id, targetId),
      ),
    );
}

export async function deleteSmtpConfigForTenant(
  tenantId: string,
  smtpAccountId: string,
): Promise<boolean> {
  const rows = await db
    .delete(smtpAccountsTable)
    .where(
      and(
        eq(smtpAccountsTable.tenantId, tenantId),
        eq(smtpAccountsTable.id, smtpAccountId),
      ),
    )
    .returning({ id: smtpAccountsTable.id });
  return rows.length > 0;
}
