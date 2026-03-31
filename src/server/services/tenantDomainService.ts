import { z } from "zod";
import { getTenantDomainByTenantId, upsertTenantDomain } from "@/server/dao/tenantDomainDao";
import {
  RESERVED_TENANT_DOMAIN_SLUGS,
  TENANT_DOMAIN_SLUG_PATTERN,
  buildTenantDomainFqdn,
  buildTenantDomainOrigin,
  getTenantDomainBase,
  normalizeTenantDomainSlug,
} from "@/server/lib/tenantDomain";

export class TenantDomainError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.message ?? body.error ?? "도메인 요청 처리 중 오류가 발생했습니다."));
    this.status = status;
    this.body = body;
  }
}

const tenantDomainSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3, "slug는 3자 이상이어야 합니다.")
    .max(63, "slug는 63자 이하여야 합니다.")
    .transform((value) => normalizeTenantDomainSlug(value))
    .refine((value) => TENANT_DOMAIN_SLUG_PATTERN.test(value), {
      message: "slug는 소문자, 숫자, 하이픈만 사용할 수 있으며 점(.)은 허용하지 않습니다.",
    })
    .refine((value) => !RESERVED_TENANT_DOMAIN_SLUGS.has(value), {
      message: "예약된 slug는 사용할 수 없습니다.",
    }),
});

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "23505";

const toResponse = (tenantId: string, domain: Awaited<ReturnType<typeof getTenantDomainByTenantId>>) => {
  const baseDomain = getTenantDomainBase();
  const existingDomain = domain
    ? {
        tenantId: domain.tenantId,
        slug: domain.slug,
        fqdn: domain.fqdn,
        origin: buildTenantDomainOrigin(domain.fqdn),
        createdAt: domain.createdAt?.toISOString() ?? null,
        updatedAt: domain.updatedAt?.toISOString() ?? null,
      }
    : null;

  return {
    tenantId,
    baseDomain,
    domain: existingDomain,
  };
};

export async function fetchTenantDomainSettings(tenantId: string) {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) {
    throw new TenantDomainError(400, {
      error: "tenantId가 필요합니다.",
    });
  }

  const domain = await getTenantDomainByTenantId(normalizedTenantId);
  return toResponse(normalizedTenantId, domain);
}

export async function saveTenantDomain(tenantId: string, body: unknown) {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) {
    throw new TenantDomainError(400, {
      error: "tenantId가 필요합니다.",
    });
  }

  const payload = tenantDomainSchema.parse(body);
  const fqdn = buildTenantDomainFqdn(payload.slug);

  try {
    const domain = await upsertTenantDomain({
      tenantId: normalizedTenantId,
      slug: payload.slug,
      fqdn,
    });
    return toResponse(normalizedTenantId, domain);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TenantDomainError(409, {
        error: "이미 사용 중인 slug입니다. 다른 값을 입력해 주세요.",
      });
    }
    throw error;
  }
}
