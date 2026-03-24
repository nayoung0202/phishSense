import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { tenantAiKeysTable, type TenantAiKeyRow } from "@/server/db/schema";
import {
  createAiKeyFingerprint,
  decryptAiKey,
  encryptAiKey,
  hasAiKeySecret,
} from "@/server/utils/aiKeyCrypto";

export const tenantAiKeyProviderSchema = z.enum(["CLAUDE", "OPENAI", "GEMINI"]);
export const tenantAiKeyStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const tenantAiKeyScopeSchema = z.enum(["template-ai", "training-page-ai"]);

export type TenantAiKeyProvider = z.infer<typeof tenantAiKeyProviderSchema>;
export type TenantAiKeyStatus = z.infer<typeof tenantAiKeyStatusSchema>;
export type TenantAiKeyScope = z.infer<typeof tenantAiKeyScopeSchema>;

export const createTenantAiKeyRequestSchema = z.object({
  provider: tenantAiKeyProviderSchema,
  label: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1).max(1000),
  scopes: z.array(tenantAiKeyScopeSchema).min(1).max(2),
});

export const updateTenantAiKeyRequestSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    status: tenantAiKeyStatusSchema.optional(),
    scopes: z.array(tenantAiKeyScopeSchema).min(1).max(2).optional(),
  })
  .refine((value) => value.label !== undefined || value.status !== undefined || value.scopes !== undefined, {
    message: "최소 한 개 이상의 수정 항목이 필요합니다.",
  });

export type TenantAiKeyListItem = {
  keyId: string;
  provider: TenantAiKeyProvider;
  label: string;
  maskedValue: string;
  status: TenantAiKeyStatus;
  scopes: TenantAiKeyScope[];
  createdAt: string;
  updatedAt: string | null;
  lastUsedAt: string | null;
};

export type ResolvedTenantAiProviderKeys = {
  hasAny: boolean;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  geminiApiKey?: string;
  preferredKeyId: string | null;
};

export class TenantAiKeyServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TenantAiKeyServiceError";
    this.status = status;
  }
}

const providerPriority: TenantAiKeyProvider[] = ["CLAUDE", "OPENAI", "GEMINI"];

const toIsoString = (value?: Date | string | null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const maskAiKey = (rawValue: string) => {
  const value = rawValue.trim();
  if (value.length <= 4) {
    return `${value.slice(0, 1)}***`;
  }
  const prefixLength = Math.min(6, Math.max(2, value.length - 4));
  return `${value.slice(0, prefixLength)}...${value.slice(-4)}`;
};

const normalizeScopes = (scopes: TenantAiKeyScope[]) =>
  Array.from(new Set(scopes.map((scope) => scope.trim() as TenantAiKeyScope)));

const normalizeRow = (row: TenantAiKeyRow): TenantAiKeyListItem => ({
  keyId: row.id,
  provider: tenantAiKeyProviderSchema.parse(row.provider),
  label: row.label,
  maskedValue: row.maskedValue,
  status: tenantAiKeyStatusSchema.parse(row.status),
  scopes: z.array(tenantAiKeyScopeSchema).parse(row.scopes ?? []),
  createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
  updatedAt: toIsoString(row.updatedAt),
  lastUsedAt: toIsoString(row.lastUsedAt),
});

const getTenantAiKeyRow = async (tenantId: string, keyId: string) => {
  const rows = await db
    .select()
    .from(tenantAiKeysTable)
    .where(and(eq(tenantAiKeysTable.tenantId, tenantId), eq(tenantAiKeysTable.id, keyId)))
    .limit(1);
  return rows[0];
};

const listActiveTenantAiKeyRows = async (tenantId: string) =>
  db
    .select()
    .from(tenantAiKeysTable)
    .where(
      and(eq(tenantAiKeysTable.tenantId, tenantId), eq(tenantAiKeysTable.status, "ACTIVE")),
    )
    .orderBy(desc(tenantAiKeysTable.updatedAt), desc(tenantAiKeysTable.createdAt));

export async function listTenantAiKeys(tenantId: string) {
  const rows = await db
    .select()
    .from(tenantAiKeysTable)
    .where(eq(tenantAiKeysTable.tenantId, tenantId))
    .orderBy(desc(tenantAiKeysTable.updatedAt), desc(tenantAiKeysTable.createdAt));
  return rows.map(normalizeRow);
}

export async function createTenantAiKey(
  tenantId: string,
  input: z.infer<typeof createTenantAiKeyRequestSchema>,
) {
  const payload = createTenantAiKeyRequestSchema.parse(input);
  const fingerprint = createAiKeyFingerprint(payload.apiKey);

  const existing = await db
    .select({ id: tenantAiKeysTable.id })
    .from(tenantAiKeysTable)
    .where(
      and(
        eq(tenantAiKeysTable.tenantId, tenantId),
        eq(tenantAiKeysTable.keyFingerprint, fingerprint),
      ),
    )
    .limit(1);

  if (existing[0]) {
    throw new TenantAiKeyServiceError(409, "이미 등록된 API 키입니다.");
  }

  if (!hasAiKeySecret()) {
    console.warn("[tenant-ai-keys] AI_KEY_SECRET가 없어 개발용 임시 키로 암호화합니다.");
  }

  const now = new Date();
  const id = randomUUID();
  await db.insert(tenantAiKeysTable).values({
    id,
    tenantId,
    provider: payload.provider,
    label: payload.label.trim(),
    keyEnc: encryptAiKey(payload.apiKey.trim()),
    maskedValue: maskAiKey(payload.apiKey),
    keyFingerprint: fingerprint,
    status: "ACTIVE",
    scopes: normalizeScopes(payload.scopes),
    createdAt: now,
    updatedAt: now,
  });

  const created = await getTenantAiKeyRow(tenantId, id);
  if (!created) {
    throw new TenantAiKeyServiceError(500, "API 키를 저장하지 못했습니다.");
  }
  return normalizeRow(created);
}

export async function updateTenantAiKey(
  tenantId: string,
  keyId: string,
  input: z.infer<typeof updateTenantAiKeyRequestSchema>,
) {
  const payload = updateTenantAiKeyRequestSchema.parse(input);
  const existing = await getTenantAiKeyRow(tenantId, keyId);

  if (!existing) {
    throw new TenantAiKeyServiceError(404, "API 키를 찾지 못했습니다.");
  }

  const rows = await db
    .update(tenantAiKeysTable)
    .set({
      label: payload.label?.trim() ?? existing.label,
      status: payload.status ?? existing.status,
      scopes: payload.scopes ? normalizeScopes(payload.scopes) : existing.scopes,
      updatedAt: new Date(),
    })
    .where(and(eq(tenantAiKeysTable.tenantId, tenantId), eq(tenantAiKeysTable.id, keyId)))
    .returning();

  const updated = rows[0];
  if (!updated) {
    throw new TenantAiKeyServiceError(500, "API 키를 수정하지 못했습니다.");
  }
  return normalizeRow(updated);
}

export async function deleteTenantAiKey(tenantId: string, keyId: string) {
  const deleted = await db
    .delete(tenantAiKeysTable)
    .where(and(eq(tenantAiKeysTable.tenantId, tenantId), eq(tenantAiKeysTable.id, keyId)))
    .returning({ id: tenantAiKeysTable.id });
  return deleted.length > 0;
}

export async function markTenantAiKeyUsed(tenantId: string, keyId: string) {
  await db
    .update(tenantAiKeysTable)
    .set({
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(tenantAiKeysTable.tenantId, tenantId), eq(tenantAiKeysTable.id, keyId)));
}

export async function hasActiveTenantAiKeyForScope(
  tenantId: string,
  scope: TenantAiKeyScope,
) {
  const rows = await listActiveTenantAiKeyRows(tenantId);
  return rows.some((row) => (row.scopes ?? []).includes(scope));
}

export async function resolveTenantAiProviderKeys(
  tenantId: string,
  scope: TenantAiKeyScope,
): Promise<ResolvedTenantAiProviderKeys> {
  const rows = await listActiveTenantAiKeyRows(tenantId);
  const scopedRows = rows.filter((row) => (row.scopes ?? []).includes(scope));
  const rowByProvider = new Map<TenantAiKeyProvider, TenantAiKeyRow>();

  for (const provider of providerPriority) {
    const row = scopedRows.find((item) => item.provider === provider);
    if (row) {
      rowByProvider.set(provider, row);
    }
  }

  const claudeRow = rowByProvider.get("CLAUDE");
  const openAiRow = rowByProvider.get("OPENAI");
  const geminiRow = rowByProvider.get("GEMINI");

  return {
    hasAny: rowByProvider.size > 0,
    anthropicApiKey: claudeRow ? decryptAiKey(claudeRow.keyEnc) : undefined,
    openAiApiKey: openAiRow ? decryptAiKey(openAiRow.keyEnc) : undefined,
    geminiApiKey: geminiRow ? decryptAiKey(geminiRow.keyEnc) : undefined,
    preferredKeyId: claudeRow?.id ?? openAiRow?.id ?? geminiRow?.id ?? null,
  };
}
