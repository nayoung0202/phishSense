import { z } from "zod";
import {
  normalizeSmtpDomains,
  validateAllowedSenderDomains,
  validateSenderEmailAgainstAllowedDomains,
} from "@/lib/smtpValidation";
import {
  createSmtpConfig,
  deleteSmtpConfigForTenant,
  getSmtpConfig,
  getSmtpConfigByIdForTenant,
  listSmtpConfigsForTenant,
  updateLastTestResult,
  updateSmtpConfigForTenant,
  type PersistedSmtpConfig,
} from "../dao/smtpDao";
import {
  assertHostNotPrivateOrLocal,
  validateSmtpInput,
  validateTestRecipientEmail,
} from "../lib/ssrfGuard";
import { sendTestEmail } from "../lib/smtp";
import { normalizeSmtpError } from "../lib/smtpError";

export class AdminSmtpError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(
      String(
        body.message ?? body.error ?? "SMTP 요청 처리 중 오류가 발생했습니다.",
      ),
    );
    this.status = status;
    this.body = body;
  }
}

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  host: z.string().trim().min(1, "SMTP 호스트는 필수입니다."),
  port: z.coerce.number().int(),
  securityMode: z.enum(["SMTPS", "STARTTLS", "NONE"]).default("STARTTLS"),
  username: z.string().trim().min(1).optional(),
  password: z.string().min(1).optional(),
  tlsVerify: z.boolean().optional(),
  rateLimitPerMin: z.coerce.number().int().min(1).optional(),
  allowedSenderDomains: z.array(z.string().trim().min(1)).optional(),
  isActive: z.boolean().optional(),
});

const testSchema = z.object({
  testSenderEmail: z
    .string()
    .trim()
    .email("테스트 발신 이메일 형식이 올바르지 않습니다."),
  testRecipientEmail: z
    .string()
    .trim()
    .min(1, "테스트 수신 이메일을 입력하세요."),
  testSubject: z
    .string()
    .trim()
    .max(120, "테스트 메일 제목은 120자 이내로 입력하세요.")
    .optional(),
  testBody: z
    .string()
    .trim()
    .max(2000, "테스트 메일 본문은 2000자 이내로 입력하세요.")
    .optional(),
});

const redactPattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeOptional = (value?: string | null) =>
  (value ?? "").trim() || null;
const sanitizeErrorMessage = (raw: string, config: PersistedSmtpConfig) => {
  const secrets = [config.password ?? "", config.username ?? ""]
    .filter((value) => Boolean(value))
    .map((value) => value.trim())
    .filter(Boolean);

  let sanitized = raw || "SMTP 테스트 중 오류가 발생했습니다.";
  for (const secret of secrets) {
    sanitized = sanitized.replace(
      new RegExp(redactPattern(secret), "gi"),
      "***",
    );
  }

  if (sanitized.length > 400) {
    return sanitized.slice(0, 400);
  }
  return sanitized;
};

const normalizeTenantId = (tenantId: string) => {
  const normalizedTenantId = (tenantId || "").trim();
  if (!normalizedTenantId) {
    throw new AdminSmtpError(400, {
      message: "tenantId 파라미터가 필요합니다.",
    });
  }
  return normalizedTenantId;
};

const normalizeSmtpAccountId = (smtpAccountId: string) => {
  const normalizedSmtpAccountId = (smtpAccountId || "").trim();
  if (!normalizedSmtpAccountId) {
    throw new AdminSmtpError(400, {
      message: "smtpAccountId 파라미터가 필요합니다.",
    });
  }
  return normalizedSmtpAccountId;
};

export const buildDefaultResponse = (tenantId: string) => ({
  id: "",
  tenantId,
  name: "",
  host: "",
  port: 587 as const,
  securityMode: "STARTTLS" as const,
  username: "",
  tlsVerify: true,
  rateLimitPerMin: 60,
  allowedSenderDomains: [] as string[],
  isActive: true,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestError: null,
  hasPassword: false,
});

const toResponsePayload = (config: PersistedSmtpConfig) => ({
  id: config.id,
  tenantId: config.tenantId,
  name: config.name,
  host: config.host,
  port: config.port,
  securityMode: config.securityMode,
  username: config.username ?? "",
  tlsVerify: config.tlsVerify,
  rateLimitPerMin: config.rateLimitPerMin,
  allowedSenderDomains: config.allowedSenderDomains ?? [],
  isActive: config.isActive,
  lastTestedAt: config.lastTestedAt ?? null,
  lastTestStatus: config.lastTestStatus ?? null,
  lastTestError: config.lastTestError ?? null,
  hasPassword: config.hasPassword,
});

const toSummaryPayload = (config: PersistedSmtpConfig) => ({
  id: config.id,
  tenantId: config.tenantId,
  name: config.name,
  host: config.host,
  port: config.port,
  securityMode: config.securityMode,
  username: config.username ?? "",
  allowedSenderDomains: config.allowedSenderDomains ?? [],
  isActive: config.isActive,
  hasPassword: config.hasPassword,
  lastTestedAt: config.lastTestedAt ?? null,
  lastTestStatus: config.lastTestStatus ?? null,
  updatedAt: config.updatedAt,
});

export async function fetchActiveTenantSmtpConfig(tenantId: string) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const config = await getSmtpConfig(normalizedTenantId);
  if (!config) {
    return buildDefaultResponse(normalizedTenantId);
  }
  return toResponsePayload(config);
}

export async function fetchTenantSmtpConfig(tenantId: string) {
  return fetchActiveTenantSmtpConfig(tenantId);
}

export async function fetchTenantSmtpConfigById(
  tenantId: string,
  smtpAccountId: string,
) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const normalizedSmtpAccountId = normalizeSmtpAccountId(smtpAccountId);
  const config = await getSmtpConfigByIdForTenant(
    normalizedTenantId,
    normalizedSmtpAccountId,
  );
  if (!config) {
    throw new AdminSmtpError(404, {
      message: "발송 설정이 존재하지 않습니다.",
    });
  }
  return toResponsePayload(config);
}

export async function fetchTenantSmtpConfigSummaries(tenantId: string) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const configs = await listSmtpConfigsForTenant(normalizedTenantId);
  return configs.map(toSummaryPayload);
}

const validateDuplicateWithinTenant = (
  tenantConfigs: PersistedSmtpConfig[],
  candidateConfig: {
    smtpAccountId?: string | null;
    host: string;
    port: number;
    securityMode: PersistedSmtpConfig["securityMode"];
    username: string | null;
    tlsVerify: boolean;
    rateLimitPerMin: number;
    allowedSenderDomains: string[];
    isActive: boolean;
    password?: string | null;
  },
) => {
  const hasSameConfig = tenantConfigs.some((config) => {
    if (config.id === candidateConfig.smtpAccountId) return false;
    const existingAllowedDomains = normalizeSmtpDomains(
      config.allowedSenderDomains,
    );
    const baseMatches =
      candidateConfig.host === config.host &&
      candidateConfig.port === config.port &&
      candidateConfig.securityMode === config.securityMode &&
      normalizeOptional(config.username) === candidateConfig.username &&
      (config.tlsVerify ?? true) === candidateConfig.tlsVerify &&
      (config.rateLimitPerMin ?? 60) === candidateConfig.rateLimitPerMin &&
      config.isActive === candidateConfig.isActive &&
      existingAllowedDomains.join("|") ===
        candidateConfig.allowedSenderDomains.join("|");

    if (!baseMatches) return false;
    if (candidateConfig.password) {
      return (config.password ?? null) === candidateConfig.password;
    }
    return true;
  });

  if (hasSameConfig) {
    throw new AdminSmtpError(409, {
      message: "동일한 발송 설정이 이미 등록되어 있습니다.",
    });
  }
};

const saveTenantSmtpConfigInternal = async (
  tenantId: string,
  body: unknown,
  options?: {
    smtpAccountId?: string | null;
  },
) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const normalizedSmtpAccountId = normalizeOptional(options?.smtpAccountId);

  try {
    const parsed = updateSchema.parse(body);
    const normalized = validateSmtpInput({
      host: parsed.host,
      port: parsed.port,
      securityMode: parsed.securityMode,
    });
    await assertHostNotPrivateOrLocal(normalized.host);

    const tenantConfigs = await listSmtpConfigsForTenant(normalizedTenantId);
    const existingConfig = normalizedSmtpAccountId
      ? (tenantConfigs.find(
          (config) => config.id === normalizedSmtpAccountId,
        ) ?? null)
      : null;

    if (normalizedSmtpAccountId && !existingConfig) {
      throw new AdminSmtpError(404, {
        message: "발송 설정이 존재하지 않습니다.",
      });
    }

    const normalizedAllowedDomains = validateAllowedSenderDomains(
      parsed.allowedSenderDomains,
    );

    const shouldActivateByDefault = tenantConfigs.length === 0;
    const nextIsActive =
      parsed.isActive ?? existingConfig?.isActive ?? shouldActivateByDefault;

    const candidateConfig = {
      smtpAccountId: normalizedSmtpAccountId,
      host: normalized.host,
      port: normalized.port,
      securityMode: normalized.securityMode,
      username: normalizeOptional(parsed.username),
      tlsVerify: parsed.tlsVerify ?? true,
      rateLimitPerMin: parsed.rateLimitPerMin ?? 60,
      allowedSenderDomains: normalizedAllowedDomains,
      isActive: nextIsActive,
      password: parsed.password ? parsed.password.trim() : null,
    };

    validateDuplicateWithinTenant(tenantConfigs, candidateConfig);

    const payload = {
      name:
        normalizeOptional(parsed.name) ??
        normalizeOptional(parsed.username) ??
        normalized.host,
      host: normalized.host,
      port: normalized.port,
      securityMode: normalized.securityMode,
      username: parsed.username?.trim() || null,
      password: parsed.password ?? undefined,
      tlsVerify: parsed.tlsVerify ?? true,
      rateLimitPerMin: parsed.rateLimitPerMin ?? 60,
      allowedSenderDomains: normalizedAllowedDomains,
      isActive: nextIsActive,
    };

    const savedConfig = normalizedSmtpAccountId
      ? await updateSmtpConfigForTenant(
          normalizedTenantId,
          normalizedSmtpAccountId,
          payload,
        )
      : await createSmtpConfig({
          tenantId: normalizedTenantId,
          ...payload,
        });

    const refreshedConfig = await getSmtpConfigByIdForTenant(
      normalizedTenantId,
      savedConfig.id,
    );
    if (!refreshedConfig) {
      throw new AdminSmtpError(500, {
        message: "발송 설정을 저장하지 못했습니다.",
      });
    }

    return {
      ok: true,
      item: toResponsePayload(refreshedConfig),
    };
  } catch (error) {
    if (error instanceof AdminSmtpError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new AdminSmtpError(400, {
        message: "입력값을 확인하세요.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    throw new AdminSmtpError(400, {
      message:
        error instanceof Error
          ? error.message
          : "발송 설정 저장 중 오류가 발생했습니다.",
    });
  }
};

export async function createTenantSmtpConfig(tenantId: string, body: unknown) {
  return saveTenantSmtpConfigInternal(tenantId, body);
}

export async function updateTenantSmtpConfig(
  tenantId: string,
  smtpAccountId: string,
  body: unknown,
) {
  const normalizedSmtpAccountId = normalizeSmtpAccountId(smtpAccountId);
  return saveTenantSmtpConfigInternal(tenantId, body, {
    smtpAccountId: normalizedSmtpAccountId,
  });
}

export async function saveTenantSmtpConfig(tenantId: string, body: unknown) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const activeConfig = await getSmtpConfig(normalizedTenantId);
  return saveTenantSmtpConfigInternal(normalizedTenantId, body, {
    smtpAccountId: activeConfig?.id ?? null,
  });
}

export async function deleteTenantSmtpConfigById(
  tenantId: string,
  smtpAccountId: string,
) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const normalizedSmtpAccountId = normalizeSmtpAccountId(smtpAccountId);
  const exists = await getSmtpConfigByIdForTenant(
    normalizedTenantId,
    normalizedSmtpAccountId,
  );
  if (!exists) {
    throw new AdminSmtpError(404, {
      message: "발송 설정이 존재하지 않습니다.",
    });
  }
  const deleted = await deleteSmtpConfigForTenant(
    normalizedTenantId,
    normalizedSmtpAccountId,
  );
  if (!deleted) {
    throw new AdminSmtpError(500, {
      message: "발송 설정 삭제에 실패했습니다.",
    });
  }
  return { ok: true };
}

export async function deleteTenantSmtpConfig(tenantId: string) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const activeConfig = await getSmtpConfig(normalizedTenantId);
  if (!activeConfig) {
    throw new AdminSmtpError(404, {
      message: "발송 설정이 존재하지 않습니다.",
    });
  }
  return deleteTenantSmtpConfigById(normalizedTenantId, activeConfig.id);
}

const testTenantSmtpConfigInternal = async (
  tenantId: string,
  body: unknown,
  options?: { smtpAccountId?: string | null },
) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const normalizedSmtpAccountId = normalizeOptional(options?.smtpAccountId);

  let recipientEmail: string | null = null;
  let senderEmail: string | null = null;
  let config: PersistedSmtpConfig | null = null;

  try {
    const parsedBody = testSchema.parse(body);
    config = normalizedSmtpAccountId
      ? await getSmtpConfigByIdForTenant(
          normalizedTenantId,
          normalizedSmtpAccountId,
        )
      : await getSmtpConfig(normalizedTenantId);

    if (!config) {
      throw new AdminSmtpError(404, {
        message: "발송 설정이 존재하지 않습니다.",
      });
    }

    const normalizedSender = validateSenderEmailAgainstAllowedDomains(
      parsedBody.testSenderEmail,
      config.allowedSenderDomains,
      "테스트 발신 이메일",
    );
    senderEmail = normalizedSender;

    const normalizedRecipient = validateTestRecipientEmail(parsedBody.testRecipientEmail);
    recipientEmail = normalizedRecipient;

    if (!config.isActive) {
      throw new AdminSmtpError(409, {
        message: "발송 설정이 비활성화되어 있습니다.",
      });
    }

    if (!config.password) {
      throw new AdminSmtpError(400, {
        message: "SMTP 비밀번호가 설정되어 있지 않습니다.",
      });
    }

    const normalized = validateSmtpInput({
      host: config.host,
      port: config.port,
      securityMode: config.securityMode,
    });
    if (normalized.port !== 465 && normalized.port !== 587) {
      throw new AdminSmtpError(400, {
        message: "테스트 발송은 465 또는 587 포트에서만 지원됩니다.",
      });
    }
    await assertHostNotPrivateOrLocal(normalized.host);

    const passwordSample = config.password ?? "";
    console.log("[SMTP_TEST_DEBUG]", {
      tenantId: normalizedTenantId,
      smtpAccountId: config.id,
      host: config.host,
      port: config.port,
      securityMode: config.securityMode,
      username: config.username ?? "(none)",
      passwordLength: passwordSample.length,
      passwordHasLeadingSpace: passwordSample.startsWith(" "),
      passwordHasTrailingSpace: passwordSample.endsWith(" "),
      passwordHasNewline: /\r|\n/.test(passwordSample),
    });

    await sendTestEmail({
      smtpConfig: config,
      senderEmail: normalizedSender,
      toEmail: normalizedRecipient,
      subject: parsedBody.testSubject,
      body: parsedBody.testBody,
    });
    await updateLastTestResult({
      tenantId: normalizedTenantId,
      smtpAccountId: config.id,
      success: true,
      errorMessage: null,
    });

    return { ok: true, message: "테스트 메일을 발송했습니다." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AdminSmtpError(400, {
        message: "입력값을 확인하세요.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const sanitizedMessage =
      config && error instanceof Error
        ? sanitizeErrorMessage(error.message, config)
        : "SMTP 테스트 중 오류가 발생했습니다.";
    const normalizedError = normalizeSmtpError(error, {
      rawMessage: sanitizedMessage,
      senderEmail,
    });

    if (config) {
      await updateLastTestResult({
        tenantId: normalizedTenantId,
        smtpAccountId: config.id,
        success: false,
        errorMessage: normalizedError.message,
      });
    }

    const shouldLogStack = process.env.NODE_ENV !== "production";
    const errorLog: Record<string, unknown> = {
      tenantId: normalizedTenantId,
      smtpAccountId: config?.id ?? normalizedSmtpAccountId ?? null,
      senderEmail,
      recipientEmail,
      providerCode: normalizedError.providerCode,
      smtpCode: normalizedError.smtpCode,
      smtpClass: normalizedError.smtpClass,
      category: normalizedError.category,
      retryable: normalizedError.retryable,
      stage: normalizedError.stage,
      message: error instanceof Error ? error.message : String(error),
    };
    if (shouldLogStack && error instanceof Error && error.stack) {
      errorLog.stack = error.stack;
    }
    console.error("[SMTP_TEST_FAILED]", errorLog);

    throw new AdminSmtpError(normalizedError.httpStatus, {
      message: normalizedError.message,
    });
  }
};

export async function testTenantSmtpConfigById(
  tenantId: string,
  smtpAccountId: string,
  body: unknown,
) {
  const normalizedSmtpAccountId = normalizeSmtpAccountId(smtpAccountId);
  return testTenantSmtpConfigInternal(tenantId, body, {
    smtpAccountId: normalizedSmtpAccountId,
  });
}

export async function testTenantSmtpConfig(tenantId: string, body: unknown) {
  return testTenantSmtpConfigInternal(tenantId, body);
}
