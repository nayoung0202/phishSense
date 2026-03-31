import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  users,
  projects,
  templates,
  targets,
  trainingPages,
  projectTargets,
  sendJobs,
  reportTemplates,
  reportInstances,
  authSessions,
  reportSettings,
} from "@shared/schema";

const timestampColumn = (column: string) => timestamp(column);

export {
  users,
  projects,
  templates,
  targets,
  trainingPages,
  projectTargets,
  sendJobs,
  reportTemplates,
  reportInstances,
  authSessions,
  reportSettings,
};

export const tenantAiKeysTable = pgTable(
  "tenant_ai_keys",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    keyEnc: text("key_enc").notNull(),
    maskedValue: text("masked_value").notNull(),
    keyFingerprint: text("key_fingerprint").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    lastUsedAt: timestampColumn("last_used_at"),
    createdAt: timestampColumn("created_at").defaultNow(),
    updatedAt: timestampColumn("updated_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("tenant_ai_keys_tenant_idx").on(table.tenantId),
    tenantStatusIdx: index("tenant_ai_keys_tenant_status_idx").on(table.tenantId, table.status),
    tenantFingerprintUnique: uniqueIndex("tenant_ai_keys_tenant_fingerprint_idx").on(
      table.tenantId,
      table.keyFingerprint,
    ),
  }),
);

export const tenantDomainsTable = pgTable(
  "tenant_domains",
  {
    tenantId: text("tenant_id").primaryKey(),
    slug: text("slug").notNull(),
    fqdn: text("fqdn").notNull(),
    createdAt: timestampColumn("created_at").defaultNow(),
    updatedAt: timestampColumn("updated_at").defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("tenant_domains_slug_idx").on(table.slug),
    fqdnUnique: uniqueIndex("tenant_domains_fqdn_idx").on(table.fqdn),
  }),
);

export const tenantCreditAccountsTable = pgTable(
  "tenant_credit_accounts",
  {
    tenantId: text("tenant_id").primaryKey(),
    planCode: text("plan_code").notNull().default("FREE"),
    balance: integer("balance").notNull().default(0),
    includedCredits: integer("included_credits").notNull().default(0),
    createdAt: timestampColumn("created_at").defaultNow(),
    updatedAt: timestampColumn("updated_at").defaultNow(),
  },
  (table) => ({
    planIdx: index("tenant_credit_accounts_plan_idx").on(table.planCode),
  }),
);

export const tenantCreditLedgerTable = pgTable(
  "tenant_credit_ledger",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    type: text("type").notNull(),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    description: text("description").notNull(),
    featureKey: text("feature_key"),
    usageContext: text("usage_context"),
    referenceId: text("reference_id"),
    metadataJson: text("metadata_json"),
    createdAt: timestampColumn("created_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("tenant_credit_ledger_tenant_idx").on(table.tenantId),
    tenantCreatedIdx: index("tenant_credit_ledger_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  }),
);

export const smtpAccountsTable = pgTable(
  "smtp_accounts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull(),
    secure: boolean("secure").notNull().default(false),
    securityMode: text("security_mode").notNull(),
    username: text("username"),
    passwordEnc: text("password_enc").notNull(),
    tlsVerify: boolean("tls_verify").notNull().default(true),
    rateLimitPerMin: integer("rate_limit_per_min").notNull().default(60),
    allowedDomainsJson: text("allowed_domains_json"),
    isActive: boolean("is_active").notNull().default(true),
    lastTestedAt: timestampColumn("last_tested_at"),
    lastTestStatus: text("last_test_status"),
    lastTestError: text("last_test_error"),
    createdAt: timestampColumn("created_at").defaultNow(),
    updatedAt: timestampColumn("updated_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("smtp_accounts_tenant_idx").on(table.tenantId),
    tenantActiveIdx: index("smtp_accounts_tenant_active_idx").on(table.tenantId, table.isActive),
  }),
);

export const platformEntitlements = pgTable(
  "platform_entitlements",
  {
    tenantId: text("tenant_id").notNull(),
    productId: text("product_id").notNull(),
    planCode: text("plan_code"),
    status: text("status").notNull(),
    seatLimit: integer("seat_limit"),
    expiresAt: timestampColumn("expires_at"),
    sourceType: text("source_type"),
    lastEventId: text("last_event_id"),
    createdAt: timestampColumn("created_at").defaultNow(),
    updatedAt: timestampColumn("updated_at").defaultNow(),
  },
  (table) => ({
    tenantProductUnique: uniqueIndex("platform_entitlements_tenant_product_idx").on(
      table.tenantId,
      table.productId,
    ),
  }),
);

export const platformEntitlementEvents = pgTable("platform_entitlement_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  tenantId: text("tenant_id").notNull(),
  productId: text("product_id").notNull(),
  occurredAt: timestampColumn("occurred_at"),
  keyId: text("key_id"),
  createdAt: timestampColumn("created_at").defaultNow(),
});

export type TemplateRow = typeof templates.$inferSelect;
export type NewTemplateRow = typeof templates.$inferInsert;
export type SmtpAccountRow = typeof smtpAccountsTable.$inferSelect;
export type NewSmtpAccountRow = typeof smtpAccountsTable.$inferInsert;
export type PlatformEntitlementRow = typeof platformEntitlements.$inferSelect;
export type NewPlatformEntitlementRow = typeof platformEntitlements.$inferInsert;
export type PlatformEntitlementEventRow = typeof platformEntitlementEvents.$inferSelect;
export type TenantAiKeyRow = typeof tenantAiKeysTable.$inferSelect;
export type NewTenantAiKeyRow = typeof tenantAiKeysTable.$inferInsert;
export type TenantDomainRow = typeof tenantDomainsTable.$inferSelect;
export type NewTenantDomainRow = typeof tenantDomainsTable.$inferInsert;
export type TenantCreditAccountRow = typeof tenantCreditAccountsTable.$inferSelect;
export type NewTenantCreditAccountRow = typeof tenantCreditAccountsTable.$inferInsert;
export type TenantCreditLedgerRow = typeof tenantCreditLedgerTable.$inferSelect;
export type NewTenantCreditLedgerRow = typeof tenantCreditLedgerTable.$inferInsert;
