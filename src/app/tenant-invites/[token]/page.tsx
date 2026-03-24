import TenantInviteAcceptPage from "@/features/settings/TenantInviteAcceptPage";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export default async function TenantInviteRoute({ params }: RouteContext) {
  const { token } = await params;
  return <TenantInviteAcceptPage token={token} />;
}
