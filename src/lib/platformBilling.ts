export const PLATFORM_BILLING_PRODUCT_ID = "PHISHSENSE";
export const PLATFORM_BILLING_APP_KEY = "PHISHSENSE";
export const PLATFORM_BILLING_PLAN_CODE = "BUSINESS";
export const PLATFORM_BILLING_CYCLE = "YEAR";
export const PLATFORM_BILLING_RETURN_PARAM = "billing";

export const PLATFORM_BILLING_ROUTE_KEYS = {
  checkoutSuccess: "CHECKOUT_SUCCESS",
  checkoutCancel: "CHECKOUT_CANCEL",
  portalReturn: "PORTAL_RETURN",
  portalDone: "PORTAL_DONE",
} as const;

export const PLATFORM_BILLING_RETURN_VALUES = {
  checkoutSuccess: "checkout-success",
  checkoutCancel: "checkout-cancel",
  portalReturn: "portal-return",
  portalDone: "portal-done",
} as const;

export const PLATFORM_BILLING_PORTAL_FLOW_TYPES = [
  "payment_method_update",
  "subscription_cancel",
] as const;

export type PlatformBillingPortalFlowType =
  (typeof PLATFORM_BILLING_PORTAL_FLOW_TYPES)[number];

export type PlatformBillingReturnState =
  (typeof PLATFORM_BILLING_RETURN_VALUES)[keyof typeof PLATFORM_BILLING_RETURN_VALUES];

export const buildTenantBillingCheckoutSessionsApiPath = (tenantId: string) =>
  `/api/platform/tenants/${tenantId}/billing/checkout-sessions`;

export const buildTenantBillingPortalSessionsApiPath = (tenantId: string) =>
  `/api/platform/tenants/${tenantId}/billing/portal-sessions`;

export const buildTenantBillingSubscriptionApiPath = (
  tenantId: string,
  productId = PLATFORM_BILLING_PRODUCT_ID,
) => `/api/platform/tenants/${tenantId}/billing/subscriptions/${productId}`;
