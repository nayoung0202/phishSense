import { z } from "zod";

export const PLATFORM_PRODUCT_ID = "PHISHSENSE";
export const PLATFORM_ACTIVE_STATUS = "ACTIVE";

export const platformEntitlementCallbackSchema = z.object({
  version: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  eventType: z.string().trim().min(1),
  occurredAt: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  entitlement: z.object({
    planCode: z.string().trim().min(1).nullable().optional(),
    status: z.string().trim().min(1),
    seatLimit: z.number().int().nullable().optional(),
    expiresAt: z.string().trim().min(1).nullable().optional(),
    sourceType: z.string().trim().min(1).nullable().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const platformMeTenantSchema = z.object({
  tenantId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
});

export const platformCreateTenantResponseSchema = z.object({
  tenantId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
});

export const platformMeProductSchema = z.object({
  tenantId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  status: z.string().trim().min(1),
  plan: z.string().trim().min(1).nullable().optional(),
  seatLimit: z.number().int().nullable().optional(),
  expiresAt: z.string().trim().min(1).nullable().optional(),
});

export const platformMeResponseSchema = z.object({
  userId: z.string().trim().min(1),
  email: z.string().trim().min(1).nullable().optional(),
  hasTenant: z.boolean(),
  currentTenantId: z.string().trim().min(1).nullable(),
  tenants: z.array(platformMeTenantSchema).default([]),
  products: z.array(platformMeProductSchema).default([]),
});

export const platformMemberSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.string().trim().min(1),
});

export const platformTenantMembersResponseSchema = z.array(platformMemberSchema);

export const platformCreateInviteRequestSchema = z.object({
  email: z.string().trim().email(),
  role: z.string().trim().min(1),
  expiresInDays: z.number().int().min(1).max(30),
});

export const platformCreateInviteResponseSchema = z.object({
  inviteId: z.string().trim().min(1),
  inviteToken: z.string().trim().min(1).optional(),
  expiresAt: z.string().trim().min(1),
});

export const platformBillingPlanTierSchema = z.object({
  minSeats: z.number().int().positive(),
  maxSeats: z.number().int().positive().nullable().optional(),
  annualUnitPrice: z.number().int().nonnegative().nullable().optional(),
  monthlyEquivalentPrice: z.number().int().nonnegative().nullable().optional(),
  includedCredits: z.number().int().nonnegative().nullable().optional(),
  note: z.string().trim().min(1).nullable().optional(),
});

export const platformBillingPlanSchema = z.object({
  planCode: z.string().trim().min(1),
  name: z.string().trim().min(1),
  shortDescription: z.string().trim().min(1),
  priceLabel: z.string().trim().min(1),
  features: z.array(z.string().trim().min(1)).default([]),
  ctaType: z.enum(["experience", "checkout", "contact", "portal", "none"]),
  ctaLabel: z.string().trim().min(1),
  contactUrl: z.string().trim().url().nullable().optional(),
  minSeats: z.number().int().positive().nullable().optional(),
  maxSeats: z.number().int().positive().nullable().optional(),
  includedCredits: z.number().int().nonnegative().nullable().optional(),
  highlighted: z.boolean().default(false),
  tierTable: z.array(platformBillingPlanTierSchema).default([]),
  overageCreditPrice: z.number().int().nonnegative().nullable().optional(),
});

export const platformBillingCatalogResponseSchema = z.object({
  productId: z.string().trim().min(1),
  currency: z.string().trim().min(1),
  vatExcluded: z.boolean().default(true),
  plans: z.array(platformBillingPlanSchema).min(1),
});

export const platformBillingSubscriptionResponseSchema = z.object({
  tenantId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  status: z.string().trim().min(1),
  providerSubscriptionId: z.string().trim().min(1).nullable().optional(),
  planCode: z.string().trim().min(1).nullable().optional(),
  billingCycle: z.string().trim().min(1).nullable().optional(),
  quantity: z.number().int().nonnegative().nullable().optional(),
  cancelAtPeriodEnd: z.boolean().default(false),
  cancelAt: z.string().trim().min(1).nullable().optional(),
  canceledAt: z.string().trim().min(1).nullable().optional(),
  currentPeriodStartAt: z.string().trim().min(1).nullable().optional(),
  currentPeriodEndAt: z.string().trim().min(1).nullable().optional(),
  current: z.boolean().default(true),
  lastSubscriptionEventCreatedAt: z.string().trim().min(1).nullable().optional(),
});

export const platformCheckoutSessionRequestSchema = z.object({
  productId: z.string().trim().min(1),
  planCode: z.string().trim().min(1),
  billingCycle: z.string().trim().min(1),
  seatCount: z.number().int().positive().nullable().optional(),
  appKey: z.string().trim().min(1),
  successRouteKey: z.string().trim().min(1),
  cancelRouteKey: z.string().trim().min(1),
});

export const platformCheckoutSessionResponseSchema = z.object({
  sessionId: z.string().trim().min(1),
  url: z.string().trim().url(),
  customerId: z.string().trim().min(1).nullable().optional(),
});

export const platformPortalSessionRequestSchema = z.object({
  productId: z.string().trim().min(1),
  flowType: z.enum(["payment_method_update", "subscription_cancel"]),
  appKey: z.string().trim().min(1),
  returnRouteKey: z.string().trim().min(1),
  afterCompletionRouteKey: z.string().trim().min(1),
});

export const platformPortalSessionResponseSchema = z.object({
  sessionId: z.string().trim().min(1),
  url: z.string().trim().url(),
  customerId: z.string().trim().min(1).nullable().optional(),
});

export const platformCreditPolicySchema = z.object({
  featureKey: z.string().trim().min(1),
  label: z.string().trim().min(1),
  cost: z.number().int().nonnegative(),
  usageContexts: z.array(z.string().trim().min(1)).default([]),
});

export const platformCreditEventSchema = z.object({
  eventId: z.string().trim().min(1),
  type: z.string().trim().min(1),
  amount: z.number().int(),
  description: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
});

export const platformCreditsResponseSchema = z.object({
  tenantId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  balance: z.number().int().nullable().optional(),
  included: z.number().int().nullable().optional(),
  pending: z.number().int().nullable().optional(),
  byokAvailable: z.boolean().default(false),
  activeAiKeys: z.number().int().nonnegative().default(0),
  rechargeUrl: z.string().trim().url().nullable().optional(),
  policies: z.array(platformCreditPolicySchema).default([]),
  recentEvents: z.array(platformCreditEventSchema).default([]),
});

export const platformCreditAuthorizationRequestSchema = z.object({
  featureKey: z.string().trim().min(1),
  usageContext: z.string().trim().min(1),
  quantity: z.number().int().positive().default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const platformCreditAuthorizationResponseSchema = z.object({
  authorizationId: z.string().trim().min(1),
  status: z.enum(["approved", "blocked"]),
  featureKey: z.string().trim().min(1),
  usageContext: z.string().trim().min(1),
  cost: z.number().int().nonnegative(),
  remainingCredits: z.number().int().nullable().optional(),
  usesByok: z.boolean().default(false),
  reasonCode: z.string().trim().min(1).nullable().optional(),
  message: z.string().trim().min(1).nullable().optional(),
});

export const platformAiKeySchema = z.object({
  keyId: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  label: z.string().trim().min(1),
  maskedValue: z.string().trim().min(1),
  status: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)).default([]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1).nullable().optional(),
  lastUsedAt: z.string().trim().min(1).nullable().optional(),
});

export const platformAiKeysResponseSchema = z.object({
  items: z.array(platformAiKeySchema).default([]),
});

export const platformCreateAiKeyRequestSchema = z.object({
  provider: z.string().trim().min(1),
  label: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)).default([]),
});

export const platformUpdateAiKeyRequestSchema = z.object({
  label: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  scopes: z.array(z.string().trim().min(1)).optional(),
});

export type PlatformEntitlementCallbackPayload = z.infer<
  typeof platformEntitlementCallbackSchema
>;
export type PlatformMeTenant = z.infer<typeof platformMeTenantSchema>;
export type PlatformMeProduct = z.infer<typeof platformMeProductSchema>;
export type PlatformMeResponse = z.infer<typeof platformMeResponseSchema>;
export type PlatformCreateTenantResponse = z.infer<
  typeof platformCreateTenantResponseSchema
>;
export type PlatformMember = z.infer<typeof platformMemberSchema>;
export type PlatformCreateInviteRequest = z.infer<
  typeof platformCreateInviteRequestSchema
>;
export type PlatformCreateInviteResponse = z.infer<
  typeof platformCreateInviteResponseSchema
>;
export type PlatformBillingPlan = z.infer<typeof platformBillingPlanSchema>;
export type PlatformBillingCatalogResponse = z.infer<
  typeof platformBillingCatalogResponseSchema
>;
export type PlatformBillingSubscriptionResponse = z.infer<
  typeof platformBillingSubscriptionResponseSchema
>;
export type PlatformCheckoutSessionRequest = z.infer<
  typeof platformCheckoutSessionRequestSchema
>;
export type PlatformCheckoutSessionResponse = z.infer<
  typeof platformCheckoutSessionResponseSchema
>;
export type PlatformPortalSessionRequest = z.infer<
  typeof platformPortalSessionRequestSchema
>;
export type PlatformPortalSessionResponse = z.infer<
  typeof platformPortalSessionResponseSchema
>;
export type PlatformCreditsResponse = z.infer<typeof platformCreditsResponseSchema>;
export type PlatformCreditPolicy = z.infer<typeof platformCreditPolicySchema>;
export type PlatformCreditAuthorizationRequest = z.infer<
  typeof platformCreditAuthorizationRequestSchema
>;
export type PlatformCreditAuthorizationResponse = z.infer<
  typeof platformCreditAuthorizationResponseSchema
>;
export type PlatformAiKey = z.infer<typeof platformAiKeySchema>;
export type PlatformAiKeysResponse = z.infer<typeof platformAiKeysResponseSchema>;
export type PlatformCreateAiKeyRequest = z.infer<
  typeof platformCreateAiKeyRequestSchema
>;
export type PlatformUpdateAiKeyRequest = z.infer<
  typeof platformUpdateAiKeyRequestSchema
>;

export type PlatformContextStatus =
  | "ready"
  | "dev_bypass"
  | "tenant_missing"
  | "tenant_selection_required"
  | "entitlement_pending"
  | "entitlement_inactive"
  | "platform_token_missing"
  | "platform_not_configured"
  | "platform_unauthorized"
  | "platform_unavailable";
