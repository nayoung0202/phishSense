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
        title: t("smtp.deleted"),
      });
      void queryClient.invalidateQueries({ queryKey: ["smtp-configs"] });
      void queryClient.invalidateQueries({ queryKey: ["smtp-config", smtpAccountId] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t("smtp.deleteFailed");
      toast({ title: t("smtp.deleteErrorTitle"), description: message, variant: "destructive" });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleDelete = (smtpAccountId: string) => {
    if (!confirm(t("common.confirmDelete"))) return;
    deleteMutation.mutate(smtpAccountId);
  };

  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("smtp.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("smtp.listDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push("/admin/smtp/new")}>{t("smtp.add")}</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("smtp.listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("smtp.empty")}</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("smtp.alias")}</TableHead>
                    <TableHead>{t("smtp.accountId")}</TableHead>
                    <TableHead>{t("smtp.host")}</TableHead>
                    <TableHead>{t("smtp.allowedDomains")}</TableHead>
                    <TableHead>{t("smtp.port")}</TableHead>
                    <TableHead>{t("smtp.securityMode")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("smtp.password")}</TableHead>
                    <TableHead>{t("smtp.lastTest")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                          {item.isActive ? t("smtp.active") : t("smtp.inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.hasPassword ? "secondary" : "destructive"}>
                          {item.hasPassword ? t("smtp.configured") : t("smtp.notConfigured")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-xs font-medium">
                            {item.lastTestStatus === "success"
                              ? t("smtp.testSuccess")
                              : item.lastTestStatus === "failure"
                                ? t("smtp.testFailure")
                                : t("smtp.notRun")}
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
                            {t("common.edit")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deleteMutation.isPending && deletingId === item.id}
                            onClick={() => handleDelete(item.id)}
                          >
                            {t("common.delete")}
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
