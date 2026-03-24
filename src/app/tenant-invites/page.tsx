import TenantInviteAcceptPage from "@/features/settings/TenantInviteAcceptPage";
import { normalizeTenantInviteToken } from "@/lib/tenantInvite";

type RouteContext = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function TenantInviteRoute({ searchParams }: RouteContext) {
  const { token } = await searchParams;
  return <TenantInviteAcceptPage token={normalizeTenantInviteToken(token)} />;
}
