"use client";

import { buildTenantInviteAcceptApiPath } from "@/lib/tenantInvite";

type ApiErrorBody = {
  error?: string;
  message?: string;
  issues?: unknown;
};

type PlatformRequestError = Error & {
  status?: number;
  body?: unknown;
};

async function requestJson<TResponse = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const headers: HeadersInit = init.body
    ? {
        "Content-Type": "application/json",
        ...init.headers,
      }
    : init.headers || {};

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  const rawText = await response.text();
  let parsedBody: unknown = null;

  if (rawText) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }
  }

  if (!response.ok) {
    const body = parsedBody as ApiErrorBody;
    const message = body?.error || body?.message || response.statusText;
    const error = new Error(message || "요청에 실패했습니다.") as PlatformRequestError;
    error.status = response.status;
    error.body = parsedBody;
    throw error;
  }

  return parsedBody as TResponse;
}

export async function fetchTenantMembers(tenantId: string) {
  return requestJson<Array<{ userId: string; role: string }>>(
    `/api/platform/tenants/${tenantId}/members`,
  );
}

export async function createTenantInvite(input: {
  tenantId: string;
  email: string;
  role: string;
  expiresInDays?: number;
}) {
  return requestJson<{
    inviteId: string;
    inviteToken?: string;
    expiresAt: string;
  }>(`/api/platform/tenants/${input.tenantId}/invites`, {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      role: input.role,
      expiresInDays: input.expiresInDays ?? 7,
    }),
  });
}

export async function acceptTenantInvite(token: string) {
  return requestJson<{
    ok: boolean;
    platformContext: unknown;
  }>(buildTenantInviteAcceptApiPath(token), {
    method: "POST",
  });
}

export async function fetchBillingCatalog() {
  return requestJson<{
    productId: string;
    currency: string;
    vatExcluded: boolean;
    plans: Array<{
      planCode: string;
      name: string;
      shortDescription: string;
      priceLabel: string;
      features: string[];
      ctaType: "experience" | "checkout" | "contact" | "portal" | "none";
      ctaLabel: string;
      contactUrl?: string | null;
      minSeats?: number | null;
      maxSeats?: number | null;
      includedCredits?: number | null;
      highlighted?: boolean;
      tierTable: Array<{
        minSeats: number;
        maxSeats?: number | null;
        annualUnitPrice?: number | null;
        monthlyEquivalentPrice?: number | null;
        includedCredits?: number | null;
        note?: string | null;
      }>;
      overageCreditPrice?: number | null;
    }>;
  }>(`/api/platform/billing/catalog`);
}

export async function fetchTenantSubscription(tenantId: string) {
  return requestJson<{
    tenantId: string;
    productId: string;
    status: string;
    planCode?: string | null;
    seatCount?: number | null;
    seatLimit?: number | null;
    billingInterval?: string | null;
    currentPeriodEnd?: string | null;
    includedCredits?: number | null;
  }>(`/api/platform/tenants/${tenantId}/subscription`);
}

export async function createCheckoutSession(input: {
  tenantId: string;
  planCode: string;
  seatCount?: number | null;
  successUrl: string;
  cancelUrl: string;
}) {
  return requestJson<{ checkoutUrl: string; sessionId?: string | null }>(
    `/api/platform/tenants/${input.tenantId}/billing/checkout-session`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function createPortalSession(input: {
  tenantId: string;
  returnUrl: string;
}) {
  return requestJson<{ portalUrl: string }>(
    `/api/platform/tenants/${input.tenantId}/billing/portal-session`,
    {
      method: "POST",
      body: JSON.stringify({ returnUrl: input.returnUrl }),
    },
  );
}

export async function fetchTenantCredits(tenantId: string) {
  return requestJson<{
    tenantId: string;
    productId: string;
    balance?: number | null;
    included?: number | null;
    pending?: number | null;
    byokAvailable: boolean;
    activeAiKeys: number;
    rechargeUrl?: string | null;
    policies: Array<{
      featureKey: string;
      label: string;
      cost: number;
      usageContexts: string[];
    }>;
    recentEvents: Array<{
      eventId: string;
      type: string;
      amount: number;
      description: string;
      createdAt: string;
    }>;
  }>(`/api/platform/tenants/${tenantId}/credits`);
}

export async function authorizeTenantCredits(input: {
  tenantId: string;
  featureKey: string;
  usageContext: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}) {
  return requestJson<{
    authorizationId: string;
    status: "approved" | "blocked";
    featureKey: string;
    usageContext: string;
    cost: number;
    remainingCredits?: number | null;
    usesByok: boolean;
    reasonCode?: string | null;
    message?: string | null;
  }>(`/api/platform/tenants/${input.tenantId}/credits/authorizations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function settleTenantCreditAuthorization(input: {
  tenantId: string;
  authorizationId: string;
  metadata?: Record<string, unknown>;
}) {
  return requestJson<{ ok: boolean }>(
    `/api/platform/tenants/${input.tenantId}/credits/authorizations/${input.authorizationId}/settle`,
    {
      method: "POST",
      body: JSON.stringify({ metadata: input.metadata ?? {} }),
    },
  );
}

export async function releaseTenantCreditAuthorization(input: {
  tenantId: string;
  authorizationId: string;
  metadata?: Record<string, unknown>;
}) {
  return requestJson<{ ok: boolean }>(
    `/api/platform/tenants/${input.tenantId}/credits/authorizations/${input.authorizationId}/release`,
    {
      method: "POST",
      body: JSON.stringify({ metadata: input.metadata ?? {} }),
    },
  );
}

export async function fetchTenantAiKeys(tenantId: string) {
  return requestJson<{
    items: Array<{
      keyId: string;
      provider: string;
      label: string;
      maskedValue: string;
      status: string;
      scopes: string[];
      createdAt: string;
      updatedAt?: string | null;
      lastUsedAt?: string | null;
    }>;
  }>(`/api/platform/tenants/${tenantId}/ai-keys`);
}

export async function createTenantAiKey(input: {
  tenantId: string;
  provider: string;
  label: string;
  apiKey: string;
  scopes: string[];
}) {
  return requestJson<{
    keyId: string;
    provider: string;
    label: string;
    maskedValue: string;
    status: string;
    scopes: string[];
    createdAt: string;
    updatedAt?: string | null;
    lastUsedAt?: string | null;
  }>(`/api/platform/tenants/${input.tenantId}/ai-keys`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTenantAiKey(input: {
  tenantId: string;
  keyId: string;
  label?: string;
  status?: string;
  scopes?: string[];
}) {
  return requestJson<{
    keyId: string;
    provider: string;
    label: string;
    maskedValue: string;
    status: string;
    scopes: string[];
    createdAt: string;
    updatedAt?: string | null;
    lastUsedAt?: string | null;
  }>(`/api/platform/tenants/${input.tenantId}/ai-keys/${input.keyId}`, {
    method: "PATCH",
    body: JSON.stringify({
      label: input.label,
      status: input.status,
      scopes: input.scopes,
    }),
  });
}

export async function deleteTenantAiKey(input: {
  tenantId: string;
  keyId: string;
}) {
  return requestJson<{ ok: boolean }>(
    `/api/platform/tenants/${input.tenantId}/ai-keys/${input.keyId}`,
    {
      method: "DELETE",
    },
  );
}
