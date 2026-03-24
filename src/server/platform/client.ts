import { getPlatformClientConfig } from "./config";
import {
  platformAiKeySchema,
  platformAiKeysResponseSchema,
  platformBillingCatalogResponseSchema,
  platformBillingSubscriptionResponseSchema,
  platformCheckoutSessionRequestSchema,
  platformCheckoutSessionResponseSchema,
  platformCreateAiKeyRequestSchema,
  platformCreateInviteRequestSchema,
  platformCreateInviteResponseSchema,
  platformCreateTenantResponseSchema,
  platformCreditAuthorizationRequestSchema,
  platformCreditAuthorizationResponseSchema,
  platformCreditsResponseSchema,
  platformMeResponseSchema,
  platformPortalSessionRequestSchema,
  platformPortalSessionResponseSchema,
  platformTenantMembersResponseSchema,
  platformUpdateAiKeyRequestSchema,
  type PlatformAiKeysResponse,
  type PlatformBillingCatalogResponse,
  type PlatformBillingSubscriptionResponse,
  type PlatformCheckoutSessionResponse,
  type PlatformCreateAiKeyRequest,
  type PlatformCreateInviteRequest,
  type PlatformCreateInviteResponse,
  type PlatformCreateTenantResponse,
  type PlatformCreditAuthorizationRequest,
  type PlatformCreditAuthorizationResponse,
  type PlatformCreditsResponse,
  type PlatformMeResponse,
  type PlatformCheckoutSessionRequest,
  type PlatformPortalSessionRequest,
  type PlatformPortalSessionResponse,
  type PlatformUpdateAiKeyRequest,
} from "./types";

const parseJson = async <T>(response: Response) => {
  const text = await response.text();
  if (!text) {
    throw new Error("[platform] 빈 응답을 수신했습니다.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("[platform] JSON 파싱에 실패했습니다.");
  }
};

const extractPlatformErrorDetail = async (response: Response) => {
  const text = await response.text();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // ignore JSON parsing errors and fallback to raw text
  }

  return text.slice(0, 240);
};

export class PlatformApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const createPlatformApiError = async (response: Response, path: string) => {
  const detail = await extractPlatformErrorDetail(response);
  throw new PlatformApiError(
    response.status,
    `[platform] ${path} 호출 실패 (${response.status})${
      detail ? `: ${detail}` : ""
    }`,
  );
};

const requestPlatform = async (options: {
  accessToken: string;
  path: string;
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
  tenantIdHeader?: string | null;
}) => {
  const { baseUrl } = getPlatformClientConfig();
  const url = new URL(options.path, baseUrl);

  const response = await fetch(url, {
    method: options.method ?? "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.tenantIdHeader
        ? { "X-Platform-Tenant-Id": options.tenantIdHeader }
        : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    await createPlatformApiError(response, options.path);
  }

  return response;
};

export async function fetchPlatformMe(options: {
  accessToken: string;
  tenantId?: string | null;
}): Promise<PlatformMeResponse> {
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: "/platform/me",
    tenantIdHeader: options.tenantId,
  });

  const parsed = await parseJson<unknown>(response);
  return platformMeResponseSchema.parse(parsed);
}

export async function createPlatformTenant(options: {
  accessToken: string;
  name: string;
}): Promise<PlatformCreateTenantResponse> {
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: "/tenants",
    method: "POST",
    body: {
      name: options.name,
    },
  });

  const parsed = await parseJson<unknown>(response);
  return platformCreateTenantResponseSchema.parse(parsed);
}

export async function fetchPlatformTenantMembers(options: {
  accessToken: string;
  tenantId: string;
}) {
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/members`,
  });

  const parsed = await parseJson<unknown>(response);
  return platformTenantMembersResponseSchema.parse(parsed);
}

export async function createPlatformTenantInvite(options: {
  accessToken: string;
  tenantId: string;
  invite: PlatformCreateInviteRequest;
}): Promise<PlatformCreateInviteResponse> {
  const payload = platformCreateInviteRequestSchema.parse(options.invite);
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/invites`,
    method: "POST",
    body: payload,
  });

  const parsed = await parseJson<unknown>(response);
  return platformCreateInviteResponseSchema.parse(parsed);
}

export async function acceptPlatformTenantInvite(options: {
  accessToken: string;
  token: string;
}) {
  await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenant-invites/${options.token}/accept`,
    method: "POST",
  });
}

export async function fetchPlatformBillingCatalog(options: {
  accessToken: string;
  productId: string;
}): Promise<PlatformBillingCatalogResponse> {
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/billing/catalog?productId=${encodeURIComponent(options.productId)}`,
  });

  const parsed = await parseJson<unknown>(response);
  return platformBillingCatalogResponseSchema.parse(parsed);
}

export async function fetchPlatformBillingSubscription(options: {
  accessToken: string;
  tenantId: string;
  productId: string;
}): Promise<PlatformBillingSubscriptionResponse> {
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/billing/subscriptions/${options.productId}`,
  });

  const parsed = await parseJson<unknown>(response);
  return platformBillingSubscriptionResponseSchema.parse(parsed);
}

export async function createPlatformCheckoutSession(options: {
  accessToken: string;
  tenantId: string;
  idempotencyKey: string;
  input: PlatformCheckoutSessionRequest;
}): Promise<PlatformCheckoutSessionResponse> {
  const payload = platformCheckoutSessionRequestSchema.parse(options.input);
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/billing/checkout-sessions`,
    method: "POST",
    headers: {
      "Idempotency-Key": options.idempotencyKey,
    },
    body: payload,
  });

  const parsed = await parseJson<unknown>(response);
  return platformCheckoutSessionResponseSchema.parse(parsed);
}

export async function createPlatformPortalSession(options: {
  accessToken: string;
  tenantId: string;
  idempotencyKey: string;
  input: PlatformPortalSessionRequest;
}): Promise<PlatformPortalSessionResponse> {
  const payload = platformPortalSessionRequestSchema.parse(options.input);
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/billing/portal-sessions`,
    method: "POST",
    headers: {
      "Idempotency-Key": options.idempotencyKey,
    },
    body: payload,
  });

  const parsed = await parseJson<unknown>(response);
  return platformPortalSessionResponseSchema.parse(parsed);
}

export async function fetchPlatformCredits(options: {
  accessToken: string;
  tenantId: string;
}): Promise<PlatformCreditsResponse> {
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/credits`,
  });

  const parsed = await parseJson<unknown>(response);
  return platformCreditsResponseSchema.parse(parsed);
}

export async function authorizePlatformCredits(options: {
  accessToken: string;
  tenantId: string;
  input: PlatformCreditAuthorizationRequest;
}): Promise<PlatformCreditAuthorizationResponse> {
  const payload = platformCreditAuthorizationRequestSchema.parse(options.input);
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/credits/authorizations`,
    method: "POST",
    body: payload,
  });

  const parsed = await parseJson<unknown>(response);
  return platformCreditAuthorizationResponseSchema.parse(parsed);
}

export async function settlePlatformCreditAuthorization(options: {
  accessToken: string;
  tenantId: string;
  authorizationId: string;
  input?: { metadata?: Record<string, unknown> };
}) {
  await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/credits/authorizations/${options.authorizationId}/settle`,
    method: "POST",
    body: options.input ?? {},
  });
}

export async function releasePlatformCreditAuthorization(options: {
  accessToken: string;
  tenantId: string;
  authorizationId: string;
  input?: { metadata?: Record<string, unknown> };
}) {
  await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/credits/authorizations/${options.authorizationId}/release`,
    method: "POST",
    body: options.input ?? {},
  });
}

export async function fetchPlatformAiKeys(options: {
  accessToken: string;
  tenantId: string;
}): Promise<PlatformAiKeysResponse> {
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/ai-keys`,
  });

  const parsed = await parseJson<unknown>(response);
  return platformAiKeysResponseSchema.parse(parsed);
}

export async function createPlatformAiKey(options: {
  accessToken: string;
  tenantId: string;
  input: PlatformCreateAiKeyRequest;
}) {
  const payload = platformCreateAiKeyRequestSchema.parse(options.input);
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/ai-keys`,
    method: "POST",
    body: payload,
  });

  const parsed = await parseJson<unknown>(response);
  return platformAiKeySchema.parse(parsed);
}

export async function updatePlatformAiKey(options: {
  accessToken: string;
  tenantId: string;
  keyId: string;
  input: PlatformUpdateAiKeyRequest;
}) {
  const payload = platformUpdateAiKeyRequestSchema.parse(options.input);
  const response = await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/ai-keys/${options.keyId}`,
    method: "PATCH",
    body: payload,
  });

  const parsed = await parseJson<unknown>(response);
  return platformAiKeySchema.parse(parsed);
}

export async function deletePlatformAiKey(options: {
  accessToken: string;
  tenantId: string;
  keyId: string;
}) {
  await requestPlatform({
    accessToken: options.accessToken,
    path: `/tenants/${options.tenantId}/ai-keys/${options.keyId}`,
    method: "DELETE",
  });
}
