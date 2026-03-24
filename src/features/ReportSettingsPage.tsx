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
        throw new Error(t("reports.listLoadFailed"));
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
        throw new Error(payload.error ?? t("reports.saveFailed"));
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
      toast({ title: t("reports.saveSuccess"), description: t("reports.settingCreated") });
    },
    onError: (error) => {
      toast({
        title: t("reports.saveFailed"),
        description: error instanceof Error ? error.message : t("reports.saveFailed"),
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
        throw new Error(payload.error ?? t("reports.defaultFailed"));
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-settings"] });
      toast({ title: t("reports.defaultSuccess"), description: t("reports.defaultUpdated") });
    },
    onError: (error) => {
      toast({
        title: t("reports.defaultFailed"),
        description: error instanceof Error ? error.message : t("reports.defaultFailed"),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) {
        throw new Error(t("reports.editMissingId"));
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
        throw new Error(payload.error ?? t("reports.editFailed"));
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
      toast({ title: t("reports.editSuccess"), description: t("reports.settingUpdated") });
    },
    onError: (error) => {
      toast({
        title: t("reports.editFailed"),
        description: error instanceof Error ? error.message : t("reports.editFailed"),
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
        <h1 className="text-3xl font-bold">{t("reports.title")}</h1>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("reports.addSetting")}
        </Button>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reports.settingName")}</TableHead>
              <TableHead>{t("common.company")}</TableHead>
              <TableHead>{t("common.approver")}</TableHead>
              <TableHead>{t("common.default")}</TableHead>
              <TableHead>{t("common.createdAt")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("reports.empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.companyName}</TableCell>
                  <TableCell>{item.approverName}</TableCell>
                  <TableCell>{item.isDefault ? <Badge>{t("common.default")}</Badge> : <Badge variant="outline">-</Badge>}</TableCell>
                  <TableCell>{item.createdAt ? new Date(item.createdAt).toLocaleDateString(intlLocale) : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      onClick={() => openEditDialog(item)}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={item.isDefault || setDefaultMutation.isPending}
                      onClick={() => setDefaultMutation.mutate(item.id)}
                    >
                      {t("common.default")}
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
            {t("common.previous")}
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
            {t("common.next")}
          </Button>
        </div>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("reports.createTitle")}</DialogTitle>
            <DialogDescription>{t("reports.createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("reports.settingName")}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("common.company")}</Label>
              <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("common.approverName")}</Label>
              <Input value={approverName} onChange={(event) => setApproverName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("reports.logoRequired")}</Label>
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
              {t("reports.saveAsDefault")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending
                ? t("common.saveProgress")
                : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("reports.editTitle")}</DialogTitle>
            <DialogDescription>{t("reports.editDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("reports.settingName")}</Label>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("common.company")}</Label>
              <Input value={editCompanyName} onChange={(event) => setEditCompanyName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("common.approverName")}</Label>
              <Input value={editApproverName} onChange={(event) => setEditApproverName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("reports.logoOptional")}</Label>
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
              {t("reports.saveAsDefault")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={!canEditSubmit || updateMutation.isPending}>
              {updateMutation.isPending
                ? t("common.saveProgress")
                : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
