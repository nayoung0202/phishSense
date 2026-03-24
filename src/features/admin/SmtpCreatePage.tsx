"use client";

import { useRouter } from "next/navigation";
import { useAutoTenantId } from "@/lib/tenant";
import { useI18n } from "@/components/I18nProvider";
import { SmtpConfigDetail } from "@/features/admin/SmtpConfigDetail";

export default function SmtpCreatePage() {
  const { t } = useI18n();
  const tenantId = useAutoTenantId();
  const router = useRouter();

  return (
    <SmtpConfigDetail
      tenantId={tenantId}
      mode="create"
      title={t("smtp.add")}
      description={t("smtp.editPageDescription")}
      onBack={() => router.push("/admin/smtp")}
    />
  );
}
