import { getAppBaseUrl } from "@/server/lib/trainingLink";

const DEFAULT_TENANT_DOMAIN_BASE = "phishsense.cloud";

export const TENANT_DOMAIN_SLUG_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const RESERVED_TENANT_DOMAIN_SLUGS = new Set([
  "api",
  "app",
  "admin",
  "login",
  "onboarding",
  "www",
]);

export const getTenantDomainBase = () => {
  const configured = process.env.TENANT_DOMAIN_BASE?.trim().toLowerCase();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_TENANT_DOMAIN_BASE;
};

export const normalizeTenantDomainSlug = (value: string) =>
  value.trim().toLowerCase();

export const buildTenantDomainFqdn = (slug: string) =>
  `${normalizeTenantDomainSlug(slug)}.${getTenantDomainBase()}`;

export const buildTenantDomainOrigin = (fqdn: string) => {
  const appBaseUrl = new URL(getAppBaseUrl());
  appBaseUrl.host = fqdn;
  appBaseUrl.pathname = "";
  appBaseUrl.search = "";
  appBaseUrl.hash = "";
  return appBaseUrl.origin;
};

export const getTenantPublicBaseUrl = async (tenantId: string) => {
  const { getTenantDomainByTenantId } = await import("@/server/dao/tenantDomainDao");
  const domain = await getTenantDomainByTenantId(tenantId);
  if (!domain?.fqdn) {
    return getAppBaseUrl();
  }

  return buildTenantDomainOrigin(domain.fqdn);
};

export const getPublicOriginFromRequest = (request: Request) => {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
};
