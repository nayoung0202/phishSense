"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { SmtpConfigDetail } from "@/features/admin/SmtpConfigDetail";

export default function SmtpEditPage({ smtpAccountId }: { smtpAccountId: string }) {
  const { t } = useI18n();
  const router = useRouter();

  if (!smtpAccountId) {
    return (
      <div className="px-4 py-6 lg:px-8">
        <p className="text-sm text-destructive">{t("smtp.editMissingId")}</p>
      </div>
    );
  }

  return (
    <SmtpConfigDetail
      smtpAccountId={smtpAccountId}
      mode="edit"
      title={t("smtp.editTitle")}
      description={t("smtp.editDescription")}
      onBack={() => router.push("/admin/smtp")}
    />
  );
}
