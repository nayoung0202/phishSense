const TENANT_INVITE_PAGE_PATH = "/tenant-invites";

export const normalizeTenantInviteToken = (
  value: string | string[] | null | undefined,
) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const buildTenantInvitePagePath = (token: string) =>
  `${TENANT_INVITE_PAGE_PATH}?token=${encodeURIComponent(token)}`;

export const buildTenantInvitePageUrl = (origin: string, token: string) =>
  `${origin}${buildTenantInvitePagePath(token)}`;

export const buildTenantInviteAcceptApiPath = (token: string) =>
  `/api/platform/tenant-invites/${encodeURIComponent(token)}/accept`;
