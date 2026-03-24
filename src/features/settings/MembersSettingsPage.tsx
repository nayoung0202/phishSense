"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Link2, Loader2, MailPlus, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/hooks/use-toast";
import {
  createTenantInvite,
  fetchTenantMembers,
} from "@/lib/platformApi";
import { useSettingsTenant } from "@/features/settings/useSettingsTenant";

const roleOptions = [
  { value: "MEMBER", label: "MEMBER" },
  { value: "ADMIN", label: "ADMIN" },
];

export default function MembersSettingsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { tenantId, membership, isLoading: isTenantLoading } = useSettingsTenant();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [origin, setOrigin] = useState("");
  const [latestInvite, setLatestInvite] = useState<{
    inviteId: string;
    inviteToken?: string;
    expiresAt: string;
  } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const membersQuery = useQuery({
    queryKey: tenantId ? [`/api/platform/tenants/${tenantId}/members`] : ["settings-members-empty"],
    queryFn: () => fetchTenantMembers(tenantId as string),
    enabled: Boolean(tenantId),
  });

  const canInvite = useMemo(
    () => ["OWNER", "ADMIN"].includes(membership?.role ?? ""),
    [membership?.role],
  );

  const inviteMutation = useMutation({
    mutationFn: async () =>
      createTenantInvite({
        tenantId: tenantId as string,
        email,
        role,
        expiresInDays: 7,
      }),
    onSuccess: (invite) => {
      setLatestInvite(invite);
      setEmail("");
      toast({
        title: t("settings.members.title"),
        description: t("settings.members.success"),
      });
    },
    onError: (error) => {
      toast({
        title: t("settings.members.title"),
        description: error instanceof Error ? error.message : t("common.unavailable"),
        variant: "destructive",
      });
    },
  });

  const inviteLink =
    latestInvite?.inviteToken && origin
      ? `${origin}/tenant-invites/${latestInvite.inviteToken}`
      : null;

  if (isTenantLoading) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    toast({
      title: t("common.copied"),
      description: inviteLink,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
              Membership
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">
              {t("settings.members.title")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t("settings.members.description")}
            </p>
          </div>
          <Badge variant={canInvite ? "default" : "outline"} className="h-fit">
            <ShieldCheck className="mr-2 h-4 w-4" />
            {membership?.role ?? "-"}
          </Badge>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <MailPlus className="h-4 w-4 text-primary" />
              <p className="font-semibold">{t("settings.members.inviteCreate")}</p>
            </div>
            {!canInvite ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.members.requireAdmin")}
              </p>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!email.trim() || inviteMutation.isPending) return;
                  inviteMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="invite-email">{t("settings.members.inviteEmail")}</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="member@evriz.co.kr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">{t("settings.members.inviteRole")}</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={!email.trim() || inviteMutation.isPending}>
                  {inviteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  ) : (
                    t("settings.members.inviteCreate")
                  )}
                </Button>
              </form>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <p className="font-semibold">{t("settings.members.inviteLink")}</p>
            </div>
            {inviteLink ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("settings.members.inviteExpires")}
                  </p>
                  <p className="mt-2 text-sm text-foreground">{latestInvite?.expiresAt}</p>
                  <p className="mt-4 break-all text-sm text-primary">{inviteLink}</p>
                </div>
                <Button type="button" variant="outline" onClick={handleCopyInviteLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  {t("settings.members.copyLink")}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                초대 링크를 생성하면 이 영역에서 바로 복사할 수 있습니다.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">{t("settings.members.listTitle")}</h3>
          {membersQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        </div>
        {membersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : membersQuery.isError ? (
          <p className="text-sm text-destructive">
            {membersQuery.error instanceof Error
              ? membersQuery.error.message
              : t("common.unavailable")}
          </p>
        ) : membersQuery.data && membersQuery.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="pb-3 font-medium">User</th>
                  <th className="pb-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {membersQuery.data.map((member) => (
                  <tr key={member.userId} className="border-b border-border/40">
                    <td className="py-4">{member.userId}</td>
                    <td className="py-4">
                      <Badge variant={member.role === "OWNER" ? "default" : "outline"}>
                        {member.role}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("settings.members.empty")}</p>
        )}
      </Card>
    </div>
  );
}
