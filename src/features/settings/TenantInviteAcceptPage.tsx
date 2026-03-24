"use client";

import { useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";
import { useAuthSession } from "@/hooks/useAuthSession";
import { acceptTenantInvite } from "@/lib/platformApi";

export default function TenantInviteAcceptPage({ token }: { token: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const sessionQuery = useAuthSession();

  const returnTo = useMemo(() => `/tenant-invites/${token}`, [token]);

  const acceptMutation = useMutation({
    mutationFn: () => acceptTenantInvite(token),
    onSuccess: (response) => {
      const context = response.platformContext as {
        currentTenantId?: string | null;
        hasAccess?: boolean;
        onboardingRequired?: boolean;
      };

      if (context?.hasAccess && !context?.onboardingRequired) {
        router.replace("/");
        return;
      }

      if (context?.currentTenantId) {
        router.replace("/");
        return;
      }

      router.replace(
        `/onboarding?reason=tenant_selection_required&returnTo=${encodeURIComponent("/")}`,
      );
    },
  });

  useEffect(() => {
    if (sessionQuery.data?.authenticated === false) {
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [router, returnTo, sessionQuery.data?.authenticated]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(78,195,224,0.16),transparent_32%),linear-gradient(180deg,rgba(7,13,24,0.98),rgba(5,8,16,1))] px-6">
      <Card className="w-full max-w-xl border-white/10 bg-card/90 p-8 shadow-[0_30px_100px_rgba(0,0,0,0.28)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
          {t("invite.title")}
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">{t("invite.title")}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {t("invite.description")}
        </p>

        {sessionQuery.isLoading ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : sessionQuery.data?.authenticated ? (
          <div className="mt-8 space-y-4">
            <p className="rounded-2xl border border-border/70 bg-background/40 p-4 text-sm">
              {sessionQuery.data.user?.email ?? "-"}
            </p>
            {acceptMutation.isError ? (
              <p className="text-sm text-destructive">
                {acceptMutation.error instanceof Error
                  ? acceptMutation.error.message
                  : t("invite.invalid")}
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("invite.accepting")}
                </>
              ) : (
                t("invite.accept")
              )}
            </Button>
          </div>
        ) : (
          <div className="mt-8">
            <Button asChild className="w-full">
              <a href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                {t("invite.goLogin")}
              </a>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
