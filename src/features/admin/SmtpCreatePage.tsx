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
      title={t("발송 설정 추가")}
      description={t("설정 별칭, SMTP 연결 정보와 허용 발신 도메인을 함께 관리합니다.")}
      onBack={() => router.push("/admin/smtp")}
    />
  );
}
