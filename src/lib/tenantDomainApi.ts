"use client";

type ApiErrorBody = {
  error?: string;
  message?: string;
};

export type TenantDomainApiResponse = {
  tenantId: string;
  baseDomain: string;
  domain: {
    tenantId: string;
    slug: string;
    fqdn: string;
    origin: string;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
};

const requestJson = async <TResponse>(
  path: string,
  init: RequestInit = {},
): Promise<TResponse> => {
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
  const body = rawText ? ((JSON.parse(rawText) as unknown) ?? null) : null;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new Error(errorBody?.error || errorBody?.message || "요청에 실패했습니다.");
  }

  return body as TResponse;
};

export async function fetchTenantDomainSettingsApi() {
  return requestJson<TenantDomainApiResponse>("/api/settings/domain");
}

export async function saveTenantDomainApi(slug: string) {
  return requestJson<TenantDomainApiResponse>("/api/settings/domain", {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
}
