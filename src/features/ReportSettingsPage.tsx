"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/components/I18nProvider";
import { getIntlLocale } from "@/lib/i18n";

type ReportSettingItem = {
  id: string;
  name: string;
  companyName: string;
  companyLogoFileKey: string;
  approverName: string;
  isDefault: boolean;
  createdAt?: string;
};

type ReportSettingsResponse = {
  items: ReportSettingItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function ReportSettingsPage() {
  const { locale, t } = useI18n();
  const intlLocale = getIntlLocale(locale);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [approverName, setApproverName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editApproverName, setEditApproverName] = useState("");
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);

  const listQuery = useQuery({
    queryKey: ["report-settings", page] as const,
    queryFn: async () => {
      const response = await fetch(`/api/reports/settings?page=${page}&pageSize=10`);
      if (!response.ok) {
        throw new Error(t("보고서 설정 목록을 불러오지 못했습니다."));
      }
      return (await response.json()) as ReportSettingsResponse;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("companyName", companyName);
      formData.set("approverName", approverName);
      formData.set("isDefault", String(isDefault));
      if (logoFile) {
        formData.set("logo", logoFile);
      }
      const response = await fetch("/api/reports/settings", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? t("보고서 설정 저장에 실패했습니다."));
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-settings"] });
      setIsCreateOpen(false);
      setName("");
      setCompanyName("");
      setApproverName("");
      setIsDefault(false);
      setLogoFile(null);
      toast({ title: t("저장 완료"), description: t("보고서 설정을 추가했습니다.") });
    },
    onError: (error) => {
      toast({
        title: t("저장 실패"),
        description: error instanceof Error ? error.message : t("보고서 설정 저장에 실패했습니다."),
        variant: "destructive",
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/reports/settings/${id}/default`, {
        method: "PATCH",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? t("기본 설정 변경에 실패했습니다."));
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-settings"] });
      toast({ title: t("변경 완료"), description: t("기본 보고서 설정을 변경했습니다.") });
    },
    onError: (error) => {
      toast({
        title: t("변경 실패"),
        description: error instanceof Error ? error.message : t("기본 설정 변경에 실패했습니다."),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) {
        throw new Error(t("수정할 설정 ID가 없습니다."));
      }
      const formData = new FormData();
      formData.set("name", editName);
      formData.set("companyName", editCompanyName);
      formData.set("approverName", editApproverName);
      formData.set("isDefault", String(editIsDefault));
      if (editLogoFile) {
        formData.set("logo", editLogoFile);
      }
      const response = await fetch(`/api/reports/settings/${editingId}`, {
        method: "PATCH",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? t("보고서 설정 수정에 실패했습니다."));
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-settings"] });
      setIsEditOpen(false);
      setEditingId(null);
      setEditName("");
      setEditCompanyName("");
      setEditApproverName("");
      setEditIsDefault(false);
      setEditLogoFile(null);
      toast({ title: t("수정 완료"), description: t("보고서 설정을 수정했습니다.") });
    },
    onError: (error) => {
      toast({
        title: t("수정 실패"),
        description: error instanceof Error ? error.message : t("보고서 설정 수정에 실패했습니다."),
        variant: "destructive",
      });
    },
  });

  const canSubmit = useMemo(
    () =>
      name.trim().length > 0 &&
      companyName.trim().length > 0 &&
      approverName.trim().length > 0 &&
      Boolean(logoFile),
    [approverName, companyName, logoFile, name],
  );
  const canEditSubmit = useMemo(
    () =>
      editName.trim().length > 0 &&
      editCompanyName.trim().length > 0 &&
      editApproverName.trim().length > 0 &&
      Boolean(editingId),
    [editApproverName, editCompanyName, editName, editingId],
  );

  const openEditDialog = (item: ReportSettingItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditCompanyName(item.companyName);
    setEditApproverName(item.approverName);
    setEditIsDefault(item.isDefault);
    setEditLogoFile(null);
    setIsEditOpen(true);
  };

  const result = listQuery.data;
  const items = result?.items ?? [];
  const totalPages = result?.totalPages ?? 1;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t("보고서 관리")}</h1>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("설정 추가")}
        </Button>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("설정명")}</TableHead>
              <TableHead>{locale === "en" ? "Company" : locale === "ja" ? "会社名" : "회사명"}</TableHead>
              <TableHead>{locale === "en" ? "Approver" : locale === "ja" ? "承認者" : "승인자"}</TableHead>
              <TableHead>{locale === "en" ? "Default" : locale === "ja" ? "既定" : "기본"}</TableHead>
              <TableHead>{locale === "en" ? "Created at" : locale === "ja" ? "作成日" : "생성일"}</TableHead>
              <TableHead className="text-right">{locale === "en" ? "Actions" : locale === "ja" ? "操作" : "동작"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("등록된 보고서 설정이 없습니다.")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.companyName}</TableCell>
                  <TableCell>{item.approverName}</TableCell>
                  <TableCell>{item.isDefault ? <Badge>{locale === "en" ? "Default" : locale === "ja" ? "既定" : "기본"}</Badge> : <Badge variant="outline">-</Badge>}</TableCell>
                  <TableCell>{item.createdAt ? new Date(item.createdAt).toLocaleDateString(intlLocale) : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      onClick={() => openEditDialog(item)}
                    >
                      {t("수정")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={item.isDefault || setDefaultMutation.isPending}
                      onClick={() => setDefaultMutation.mutate(item.id)}
                    >
                      {t("기본 설정")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            {locale === "en" ? "Previous" : locale === "ja" ? "前へ" : "이전"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            {locale === "en" ? "Next" : locale === "ja" ? "次へ" : "다음"}
          </Button>
        </div>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("보고서 설정 추가")}</DialogTitle>
            <DialogDescription>{locale === "en" ? "Register company, logo, and approver information." : locale === "ja" ? "会社名、ロゴ、承認者情報を登録します。" : "회사명, 로고, 승인자 정보를 등록합니다."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("설정명")}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{locale === "en" ? "Company" : locale === "ja" ? "会社名" : "회사명"}</Label>
              <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{locale === "en" ? "Approver name" : locale === "ja" ? "承認者名" : "승인자명"}</Label>
              <Input value={approverName} onChange={(event) => setApproverName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{locale === "en" ? "Company logo (PNG/JPEG, up to 5MB)" : locale === "ja" ? "会社ロゴ (PNG/JPEG、5MB以下)" : "회사 로고 (PNG/JPEG, 5MB 이하)"}</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
              />
              {t("기본 설정으로 저장")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {locale === "en" ? "Cancel" : locale === "ja" ? "キャンセル" : "취소"}
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending
                ? locale === "en"
                  ? "Saving..."
                  : locale === "ja"
                    ? "保存中..."
                    : "저장 중..."
                : locale === "en"
                  ? "Save"
                  : locale === "ja"
                    ? "保存"
                    : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("보고서 설정 수정")}</DialogTitle>
            <DialogDescription>{locale === "en" ? "Update only the fields you need and save." : locale === "ja" ? "必要な項目だけ修正して保存してください。" : "필요한 항목만 수정하고 저장하세요."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("설정명")}</Label>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{locale === "en" ? "Company" : locale === "ja" ? "会社名" : "회사명"}</Label>
              <Input value={editCompanyName} onChange={(event) => setEditCompanyName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{locale === "en" ? "Approver name" : locale === "ja" ? "承認者名" : "승인자명"}</Label>
              <Input value={editApproverName} onChange={(event) => setEditApproverName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{locale === "en" ? "Company logo (PNG/JPEG, up to 5MB, optional)" : locale === "ja" ? "会社ロゴ (PNG/JPEG、5MB以下、任意)" : "회사 로고 (PNG/JPEG, 5MB 이하, 선택)"}</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => setEditLogoFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editIsDefault}
                onChange={(event) => setEditIsDefault(event.target.checked)}
              />
              {t("기본 설정으로 저장")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              {locale === "en" ? "Cancel" : locale === "ja" ? "キャンセル" : "취소"}
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={!canEditSubmit || updateMutation.isPending}>
              {updateMutation.isPending
                ? locale === "en"
                  ? "Saving..."
                  : locale === "ja"
                    ? "保存中..."
                    : "저장 중..."
                : locale === "en"
                  ? "Save"
                  : locale === "ja"
                    ? "保存"
                    : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
