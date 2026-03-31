import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  platformEntitlements,
  tenantCreditAccountsTable,
  tenantCreditLedgerTable,
} from "@/server/db/schema";
import { PLATFORM_PRODUCT_ID } from "@/server/platform/types";

type CreditTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CreditExecutor = typeof db | CreditTransaction;

export const tenantCreditLedgerTypeSchema = z.enum([
  "GRANT",
  "DEDUCTION",
  "RECHARGE",
  "RESTORE",
]);

export type TenantCreditLedgerType = z.infer<typeof tenantCreditLedgerTypeSchema>;

export type TenantCreditPolicy = {
  featureKey: string;
  label: string;
  cost: number;
  usageContexts: string[];
};

export type TenantCreditSummary = {
  tenantId: string;
  productId: string;
  balance: number;
  byokAvailable: boolean;
  activeAiKeys: number;
  rechargeUrl: string;
  policies: TenantCreditPolicy[];
  recentEvents: Array<{
    eventId: string;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
  }>;
};

export type TenantCreditConsumptionResult = {
  status: "consumed" | "blocked";
  featureKey: string;
  usageContext: string;
  cost: number;
  remainingCredits: number;
  reasonCode?: string | null;
  message?: string | null;
  rechargeUrl?: string | null;
};

export class TenantCreditServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TenantCreditServiceError";
    this.status = status;
  }
}

const DEFAULT_RECHARGE_URL =
  process.env.CREDITS_RECHARGE_URL?.trim() ||
  "mailto:sales@evriz.co.kr?subject=PhishSense%20Credit%20Recharge";

const canonicalCreditPolicies: TenantCreditPolicy[] = [
  {
    featureKey: "template_ai_generate",
    label: "AI 템플릿 생성",
    cost: 2,
    usageContexts: ["standard", "experience"],
  },
  {
    featureKey: "training_page_ai_generate",
    label: "AI 훈련 안내 페이지 생성",
    cost: 1,
    usageContexts: ["standard"],
  },
];

const creditPolicyAliases = new Map<string, string>([
  ["template_ai_generate", "template_ai_generate"],
  ["template_ai_standard", "template_ai_generate"],
  ["template_ai_experience", "template_ai_generate"],
  ["training_page_ai_generate", "training_page_ai_generate"],
  ["training_page_ai_standard", "training_page_ai_generate"],
]);

const ledgerTypeLabels: Record<TenantCreditLedgerType, string> = {
  GRANT: "지급",
  DEDUCTION: "차감",
  RECHARGE: "충전",
  RESTORE: "복구",
};

const normalizePlanCode = (planCode: string | null | undefined) =>
  (planCode || "FREE").trim().toUpperCase();

const resolveIncludedCredits = (planCode: string | null | undefined) => {
  switch (normalizePlanCode(planCode)) {
    case "BUSINESS":
      return 10;
    case "FREE":
      return 3;
    default:
      return 0;
  }
};

const buildGrantDescription = (planCode: string, amount: number) =>
  amount > 0
    ? `${planCode} 플랜 기본 제공 크레딧 지급`
    : `${planCode} 플랜 크레딧 상태 동기화`;

const serializeMetadata = (metadata?: Record<string, unknown>) =>
  metadata ? JSON.stringify(metadata) : null;

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return new Date().toISOString();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const resolveCreditPolicy = (featureKey: string, usageContext: string) => {
  const canonicalFeatureKey = creditPolicyAliases.get(featureKey);
  if (!canonicalFeatureKey) {
    throw new TenantCreditServiceError(422, "알 수 없는 크레딧 차감 기능입니다.");
  }

  const policy = canonicalCreditPolicies.find((item) => item.featureKey === canonicalFeatureKey);
  if (!policy) {
    throw new TenantCreditServiceError(422, "알 수 없는 크레딧 차감 기능입니다.");
  }

  if (!policy.usageContexts.includes(usageContext)) {
    throw new TenantCreditServiceError(422, "허용되지 않은 크레딧 사용 컨텍스트입니다.");
  }

  return policy;
};

const getAccountRow = async (database: CreditExecutor, tenantId: string) => {
  const rows = await database
    .select()
    .from(tenantCreditAccountsTable)
    .where(eq(tenantCreditAccountsTable.tenantId, tenantId))
    .limit(1);

  return rows[0] ?? null;
};

const resolveTenantPlanCode = async (database: CreditExecutor, tenantId: string) => {
  const rows = await database
    .select({ planCode: platformEntitlements.planCode })
    .from(platformEntitlements)
    .where(
      and(
        eq(platformEntitlements.tenantId, tenantId),
        eq(platformEntitlements.productId, PLATFORM_PRODUCT_ID),
      ),
    )
    .limit(1);

  return normalizePlanCode(rows[0]?.planCode);
};

const insertLedgerEvent = async (options: {
  database: CreditExecutor;
  tenantId: string;
  type: TenantCreditLedgerType;
  amount: number;
  balanceAfter: number;
  description: string;
  featureKey?: string | null;
  usageContext?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  await options.database.insert(tenantCreditLedgerTable).values({
    id: randomUUID(),
    tenantId: options.tenantId,
    type: options.type,
    amount: options.amount,
    balanceAfter: options.balanceAfter,
    description: options.description,
    featureKey: options.featureKey ?? null,
    usageContext: options.usageContext ?? null,
    referenceId: options.referenceId ?? null,
    metadataJson: serializeMetadata(options.metadata),
    createdAt: new Date(),
  });
};

const ensureTenantCreditAccount = async (database: CreditExecutor, tenantId: string) => {
  const planCode = await resolveTenantPlanCode(database, tenantId);
  const targetIncludedCredits = resolveIncludedCredits(planCode);
  const existing = await getAccountRow(database, tenantId);

  if (!existing) {
    const inserted = await database
      .insert(tenantCreditAccountsTable)
      .values({
        tenantId,
        planCode,
        balance: targetIncludedCredits,
        includedCredits: targetIncludedCredits,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    const created = inserted[0] ?? (await getAccountRow(database, tenantId));
    if (!created) {
      throw new TenantCreditServiceError(500, "크레딧 계정을 초기화하지 못했습니다.");
    }

    if (inserted[0] && targetIncludedCredits > 0) {
      await insertLedgerEvent({
        database,
        tenantId,
        type: "GRANT",
        amount: targetIncludedCredits,
        balanceAfter: created.balance,
        description: buildGrantDescription(planCode, targetIncludedCredits),
        metadata: {
          source: "plan_default",
          planCode,
        },
      });
    }

    return created;
  }

  if (targetIncludedCredits > existing.includedCredits) {
    const grantAmount = targetIncludedCredits - existing.includedCredits;
    const updatedRows = await database
      .update(tenantCreditAccountsTable)
      .set({
        planCode,
        balance: existing.balance + grantAmount,
        includedCredits: targetIncludedCredits,
        updatedAt: new Date(),
      })
      .where(eq(tenantCreditAccountsTable.tenantId, tenantId))
      .returning();

    const updated = updatedRows[0];
    if (!updated) {
      throw new TenantCreditServiceError(500, "크레딧 계정을 갱신하지 못했습니다.");
    }

    await insertLedgerEvent({
      database,
      tenantId,
      type: "GRANT",
      amount: grantAmount,
      balanceAfter: updated.balance,
      description: buildGrantDescription(planCode, grantAmount),
      metadata: {
        source: "plan_upgrade",
        planCode,
      },
    });

    return updated;
  }

  if (existing.planCode !== planCode) {
    const updatedRows = await database
      .update(tenantCreditAccountsTable)
      .set({
        planCode,
        updatedAt: new Date(),
      })
      .where(eq(tenantCreditAccountsTable.tenantId, tenantId))
      .returning();

    return updatedRows[0] ?? existing;
  }

  return existing;
};

const buildBlockedMessage = (label: string, cost: number, availableCredits: number) =>
  `크레딧이 부족합니다. ${label}에는 ${cost}크레딧이 필요하지만 현재 사용 가능한 크레딧은 ${availableCredits}입니다. 계속 이용하려면 크레딧을 충전해주세요.`;

const buildDeductionDescription = (policy: TenantCreditPolicy) => `${policy.label} 차감`;

export function listTenantCreditPolicies() {
  return canonicalCreditPolicies.map((policy) => ({ ...policy }));
}

export async function getTenantCreditSummary(tenantId: string): Promise<TenantCreditSummary> {
  const account = await db.transaction(async (tx) => ensureTenantCreditAccount(tx, tenantId));
  const recentEvents = await db
    .select()
    .from(tenantCreditLedgerTable)
    .where(eq(tenantCreditLedgerTable.tenantId, tenantId))
    .orderBy(desc(tenantCreditLedgerTable.createdAt))
    .limit(10);

  return {
    tenantId,
    productId: PLATFORM_PRODUCT_ID,
    balance: account.balance,
    byokAvailable: false,
    activeAiKeys: 0,
    rechargeUrl: DEFAULT_RECHARGE_URL,
    policies: listTenantCreditPolicies(),
    recentEvents: recentEvents.map((event) => ({
      eventId: event.id,
      type: ledgerTypeLabels[tenantCreditLedgerTypeSchema.parse(event.type)],
      amount: event.amount,
      description: event.description,
      createdAt: toIsoString(event.createdAt),
    })),
  };
}

export async function consumeTenantCredits(options: {
  tenantId: string;
  featureKey: string;
  usageContext: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}): Promise<TenantCreditConsumptionResult> {
  const quantity = Math.max(1, options.quantity ?? 1);
  const policy = resolveCreditPolicy(options.featureKey, options.usageContext);
  const totalCost = policy.cost * quantity;

  return db.transaction(async (tx) => {
    const account = await ensureTenantCreditAccount(tx, options.tenantId);
    const updatedRows = await tx
      .update(tenantCreditAccountsTable)
      .set({
        balance: sql`${tenantCreditAccountsTable.balance} - ${totalCost}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantCreditAccountsTable.tenantId, options.tenantId),
          sql`${tenantCreditAccountsTable.balance} >= ${totalCost}`,
        ),
      )
      .returning();

    const updated = updatedRows[0];
    if (!updated) {
      const availableCredits = Math.max(0, account.balance);
      const message = buildBlockedMessage(policy.label, totalCost, availableCredits);
      return {
        status: "blocked" as const,
        featureKey: policy.featureKey,
        usageContext: options.usageContext,
        cost: totalCost,
        remainingCredits: availableCredits,
        reasonCode: "INSUFFICIENT_CREDITS",
        message,
        rechargeUrl: DEFAULT_RECHARGE_URL,
      };
    }

    await insertLedgerEvent({
      database: tx,
      tenantId: options.tenantId,
      type: "DEDUCTION",
      amount: -totalCost,
      balanceAfter: updated.balance,
      description: buildDeductionDescription(policy),
      featureKey: policy.featureKey,
      usageContext: options.usageContext,
      metadata: options.metadata,
    });

    return {
      status: "consumed" as const,
      featureKey: policy.featureKey,
      usageContext: options.usageContext,
      cost: totalCost,
      remainingCredits: Math.max(0, updated.balance),
      reasonCode: null,
      message: null,
      rechargeUrl: null,
    };
  });
}

async function adjustTenantCredits(options: {
  tenantId: string;
  amount: number;
  type: Extract<TenantCreditLedgerType, "RECHARGE" | "RESTORE">;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  if (options.amount <= 0) {
    throw new TenantCreditServiceError(422, "크레딧 증감 값은 1 이상이어야 합니다.");
  }

  return db.transaction(async (tx) => {
    await ensureTenantCreditAccount(tx, options.tenantId);
    const updatedRows = await tx
      .update(tenantCreditAccountsTable)
      .set({
        balance: sql`${tenantCreditAccountsTable.balance} + ${options.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(tenantCreditAccountsTable.tenantId, options.tenantId))
      .returning();

    const updated = updatedRows[0];
    if (!updated) {
      throw new TenantCreditServiceError(500, "크레딧 계정을 찾지 못했습니다.");
    }

    await insertLedgerEvent({
      database: tx,
      tenantId: options.tenantId,
      type: options.type,
      amount: options.amount,
      balanceAfter: updated.balance,
      description: options.description,
      metadata: options.metadata,
    });

    return updated;
  });
}

export async function rechargeTenantCredits(
  tenantId: string,
  amount: number,
  metadata?: Record<string, unknown>,
) {
  return adjustTenantCredits({
    tenantId,
    amount,
    type: "RECHARGE",
    description: "크레딧 충전",
    metadata,
  });
}

export async function restoreTenantCredits(
  tenantId: string,
  amount: number,
  metadata?: Record<string, unknown>,
) {
  return adjustTenantCredits({
    tenantId,
    amount,
    type: "RESTORE",
    description: "크레딧 복구",
    metadata,
  });
}
