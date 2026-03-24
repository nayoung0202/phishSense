"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteSmtpConfig, listSmtpConfigs } from "@/lib/api";
import type { SmtpConfigSummary } from "@/types/smtp";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/components/I18nProvider";
import { getIntlLocale } from "@/lib/i18n";

export default function SmtpListPage() {
  const { locale, t } = useI18n();
  const intlLocale = getIntlLocale(locale);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {
    data,
  } = useQuery<SmtpConfigSummary[]>({
    queryKey: ["smtp-configs"],
    queryFn: listSmtpConfigs,
  });

  const items = data ?? [];

  const formatDomains = (domains?: string[] | null) => {
    const normalized = (domains ?? []).map((domain) => domain.trim()).filter(Boolean);
    if (normalized.length === 0) return "-";
    return normalized.join(", ");
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [items]);

  const deleteMutation = useMutation({
    mutationFn: async (smtpAccountId: string) => {
      await deleteSmtpConfig(smtpAccountId);
      return smtpAccountId;
    },
    onMutate: (smtpAccountId) => {
      setDeletingId(smtpAccountId);
    },
    onSuccess: (smtpAccountId) => {
      toast({
        title: t("발송 설정을 삭제했습니다."),
      });
      void queryClient.invalidateQueries({ queryKey: ["smtp-configs"] });
      void queryClient.invalidateQueries({ queryKey: ["smtp-config", smtpAccountId] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t("삭제에 실패했습니다.");
      toast({ title: t("삭제 실패"), description: message, variant: "destructive" });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleDelete = (smtpAccountId: string) => {
    if (!confirm(t("정말 삭제하시겠습니까?"))) return;
    deleteMutation.mutate(smtpAccountId);
  };

  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("발송 설정")}</h1>
          <p className="text-sm text-muted-foreground">{t("설정 별칭, SMTP 계정, 허용 발신 도메인을 관리합니다.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push("/admin/smtp/new")}>{t("발송 설정 추가")}</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("발송 설정 목록")}</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("등록된 발송 설정이 없습니다. 새 설정을 추가해 주세요.")}</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("설정 별칭")}</TableHead>
                    <TableHead>{t("계정 아이디")}</TableHead>
                    <TableHead>{t("호스트")}</TableHead>
                    <TableHead>{t("허용 발신 도메인")}</TableHead>
                    <TableHead>{t("포트")}</TableHead>
                    <TableHead>{t("보안 모드")}</TableHead>
                    <TableHead>{t("상태")}</TableHead>
                    <TableHead>{t("비밀번호")}</TableHead>
                    <TableHead>{t("최근 테스트")}</TableHead>
                    <TableHead className="text-right">{t("액션")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name || "-"}</TableCell>
                      <TableCell>{item.username || "-"}</TableCell>
                      <TableCell>{item.host || "-"}</TableCell>
                      <TableCell>{formatDomains(item.allowedSenderDomains)}</TableCell>
                      <TableCell>{item.port}</TableCell>
                      <TableCell>{item.securityMode}</TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "secondary" : "destructive"}>
                          {item.isActive ? t("활성") : t("비활성")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.hasPassword ? "secondary" : "destructive"}>
                          {item.hasPassword ? t("등록") : t("미등록")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-xs font-medium">
                            {item.lastTestStatus === "success"
                              ? t("성공")
                              : item.lastTestStatus === "failure"
                                ? t("실패")
                                : t("미실행")}
                          </p>
                          <p className="text-xs text-muted-foreground">{item.lastTestedAt ? new Date(item.lastTestedAt).toLocaleString(intlLocale) : "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/smtp/${item.id}`)}
                          >
                            {t("수정")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deleteMutation.isPending && deletingId === item.id}
                            onClick={() => handleDelete(item.id)}
                          >
                            {locale === "en" ? "Delete" : locale === "ja" ? "削除" : "삭제"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
