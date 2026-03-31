import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenantDomainsTable, type TenantDomainRow } from "../db/schema";

export async function getTenantDomainByTenantId(
  tenantId: string,
): Promise<TenantDomainRow | undefined> {
  const rows = await db
    .select()
    .from(tenantDomainsTable)
    .where(eq(tenantDomainsTable.tenantId, tenantId))
    .limit(1);
  return rows[0];
}

export async function upsertTenantDomain(
  payload: Pick<TenantDomainRow, "tenantId" | "slug" | "fqdn">,
): Promise<TenantDomainRow> {
  const now = new Date();
  const rows = await db
    .insert(tenantDomainsTable)
    .values({
      tenantId: payload.tenantId,
      slug: payload.slug,
      fqdn: payload.fqdn,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: tenantDomainsTable.tenantId,
      set: {
        slug: payload.slug,
        fqdn: payload.fqdn,
        updatedAt: now,
      },
    })
    .returning();

  const domain = rows[0];
  if (!domain) {
    throw new Error("tenant 도메인을 저장하지 못했습니다.");
  }

  return domain;
}
