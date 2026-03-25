"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { getProjectDepartmentDisplay } from "@shared/projectDepartment";
import {
  getMissingReportCaptures,
  hasAllReportCaptures,
  reportCaptureFields,
  type ReportCaptureKey,
} from "@/lib/reportCaptures";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getIntlLocale } from "@/lib/i18n";

type ReportSettingItem = {
  id: string;
  name: string;
  companyName: string;
  approverName: string;
  approverTitle?: string;
  isDefault: boolean;
};

type ReportSettingsResponse = {
  items: ReportSettingItem[];
};

type ReportGenerateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onProjectUpdated?: (project: Project) => void;
  onGenerated?: () => void;
};

const EMPTY_CAPTURE_FILES: Record<ReportCaptureKey, File | null> = {
  capture_inbox: null,
  capture_email_body: null,
  capture_malicious_page: null,
  capture_training_page: null,
};

export function ReportGenerateDialog({
  open,
  onOpenChange,
  project,
  onProjectUpdated,
  onGenerated,
}: ReportGenerateDialogProps) {
  const { locale, t } = useI18n();
  const { toast } = useToast();
  const [currentProject, setCurrentProject] = useState<Project | null>(project);
  const [captureFiles, setCaptureFiles] = useState<Record<ReportCaptureKey, File | null>>(EMPTY_CAPTURE_FILES);
  const [isCaptureUploading, setIsCaptureUploading] = useState(false);
  const [isReportGenerating, setIsReportGenerating] = useState(false);
  const [selectedReportSettingId, setSelectedReportSettingId] = useState("");

  const reportSettingsQuery = useQuery({
    queryKey: ["report-settings", "for-generate"] as const,
    queryFn: async () => {
      const response = await fetch("/api/reports/settings?page=1&pageSize=100");
      if (!response.ok) {
        throw new Error(t("reportGenerate.loadSettingsFailed"));
      }
      return (await response.json()) as ReportSettingsResponse;
    },
    enabled: open,
  });

  const reportSettings = reportSettingsQuery.data?.items ?? [];
  const hasReportSettings = reportSettings.length > 0;

  useEffect(() => {
    setCurrentProject(project);
  }, [project]);

  useEffect(() => {
    if (!open) {
      setCaptureFiles(EMPTY_CAPTURE_FILES);
      return;
    }
    setCaptureFiles(EMPTY_CAPTURE_FILES);
  }, [open, project?.id]);

  useEffect(() => {
    if (!open) return;
    if (!hasReportSettings) {
      setSelectedReportSettingId("");
      return;
    }
    if (selectedReportSettingId && reportSettings.some((item) => item.id === selectedReportSettingId)) {
      return;
    }
    const defaultSetting = reportSettings.find((item) => item.isDefault) ?? reportSettings[0];
    setSelectedReportSettingId(defaultSetting?.id ?? "");
  }, [open, hasReportSettings, reportSettings, selectedReportSettingId]);

  const selectedSetting = useMemo(
    () => reportSettings.find((item) => item.id === selectedReportSettingId) ?? null,
    [reportSettings, selectedReportSettingId],
  );

  const handleCaptureFileChange =
    (key: ReportCaptureKey) => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      setCaptureFiles((prev) => ({ ...prev, [key]: file }));
    };

  const uploadReportCaptures = async () => {
    if (!currentProject || isCaptureUploading) return;
    const selected = reportCaptureFields.filter((field) => captureFiles[field.key]);
    if (selected.length === 0) {
      alert(t("reportGenerate.noUploadFileAlert"));
      return;
    }

    setIsCaptureUploading(true);
    try {
      const formData = new FormData();
      selected.forEach((field) => {
        const file = captureFiles[field.key];
        if (file) {
          formData.append(field.key, file);
        }
      });

      const res = await fetch(`/api/projects/${currentProject.id}/report-captures`, {
        method: "POST",
        body: formData,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || t("reportGenerate.uploadFailed"));
      }

      const updated = payload.project as Project | undefined;
      if (updated) {
        setCurrentProject(updated);
        onProjectUpdated?.(updated);
      }

      toast({
        title: t("reportGenerate.uploadSuccessTitle"),
        description: t("reportGenerate.captureSavedDescription"),
      });
      setCaptureFiles(EMPTY_CAPTURE_FILES);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("reportGenerate.uploadFailed");
      toast({
        title: t("reportGenerate.uploadFailedTitle"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsCaptureUploading(false);
    }
  };

  const generateReport = async () => {
    if (!currentProject || isReportGenerating) return;
    if (!selectedReportSettingId) return;
    if (!hasAllReportCaptures(currentProject)) {
      const missing = getMissingReportCaptures(currentProject).map((field) => t(field.labelKey));
      alert(t("reportGenerate.missingCapturesAlert", { captures: missing.join(", ") }));
      return;
    }

    setIsReportGenerating(true);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProject.id,
          reportSettingId: selectedReportSettingId,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || t("reportGenerate.generateFailed"));
      }

      const payload = (await res.json()) as { downloadUrl?: string };
      if (!payload.downloadUrl) {
        throw new Error(t("reportGenerate.downloadUrlMissing"));
      }

      window.location.href = payload.downloadUrl;
      toast({
        title: t("reportGenerate.generateSuccessTitle"),
        description: t("reportGenerate.generateSuccessDescription"),
      });
      onGenerated?.();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("reportGenerate.generateFailed");
      toast({
        title: t("reportGenerate.generateFailedTitle"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsReportGenerating(false);
    }
  };

  const canGenerate = hasReportSettings && Boolean(selectedReportSettingId);
  const intlLocale = getIntlLocale(locale);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="report-generate-dialog"
        className="flex max-h-[92vh] w-[96vw] max-w-[64rem] flex-col overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>{t("reportGenerate.title")}</DialogTitle>
          <DialogDescription>{t("reportGenerate.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-6 py-2">
          <div className="text-sm text-muted-foreground">
          {currentProject ? (
            <div className="space-y-2">
              <p>
                <span className="font-semibold">{t("reportGenerate.projectNameLabel")}</span> {currentProject.name}
              </p>
              <p>
                <span className="font-semibold">{t("reportGenerate.projectDepartmentLabel")}</span> {getProjectDepartmentDisplay(currentProject)}
              </p>
              <p>
                <span className="font-semibold">{t("reportGenerate.projectScheduleLabel")}</span>{" "}
                {new Date(currentProject.startDate).toLocaleDateString(intlLocale)} ~{" "}
                {new Date(currentProject.endDate).toLocaleDateString(intlLocale)}
              </p>
              <p>{currentProject.description ?? t("common.noDescription")}</p>
            </div>
          ) : (
            <p>{t("reportGenerate.noProjectSelected")}</p>
          )}
          </div>

        <div className="space-y-2 rounded-lg border border-muted p-3">
          <Label className="text-sm font-semibold">{t("reportGenerate.selectSettingLabel")}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedReportSettingId}
            onChange={(event) => setSelectedReportSettingId(event.target.value)}
            disabled={!hasReportSettings || reportSettingsQuery.isLoading}
          >
            {!hasReportSettings ? (
              <option value="">{t("reportGenerate.noSettings")}</option>
            ) : (
              reportSettings.map((setting) => (
                <option key={setting.id} value={setting.id}>
                  {setting.name} ({setting.companyName}){setting.isDefault ? ` · ${t("common.default")}` : ""}
                </option>
              ))
            )}
          </select>
          {!hasReportSettings ? (
            <p className="text-xs text-destructive">
              {t("reportGenerate.requireSettings")}
            </p>
          ) : selectedSetting ? (
            <p className="text-xs text-muted-foreground">
              {t("reportGenerate.approverLabel")} {selectedSetting.approverName}
              {selectedSetting.approverTitle ? ` (${selectedSetting.approverTitle})` : ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-lg border border-muted p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{t("reportGenerate.captureSectionTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("reportGenerate.captureSectionDescription")}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={uploadReportCaptures}
              disabled={!currentProject || isCaptureUploading}
            >
              {isCaptureUploading ? t("reportGenerate.uploadingButton") : t("reportGenerate.uploadButton")}
            </Button>
          </div>
          <div className="space-y-3">
            {reportCaptureFields.map((field) => {
              const file = captureFiles[field.key];
              const uploaded = currentProject?.[field.projectField];
              const status = file
                ? t("reportGenerate.fileSelectedStatus", { file: file.name })
                : uploaded
                  ? t("reportGenerate.fileUploadedStatus")
                  : t("reportGenerate.fileMissingStatus");
              return (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs font-semibold">{t(field.labelKey)}</Label>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="w-full"
                      onChange={handleCaptureFileChange(field.key)}
                      disabled={!currentProject || isCaptureUploading}
                    />
                    <span className="text-xs text-muted-foreground">{status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t(field.descriptionKey)}</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t("reportGenerate.allCapturesRequired")}</p>
        </div>

          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 px-6 pb-6 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
          <Button onClick={generateReport} disabled={!canGenerate || isReportGenerating}>
            {isReportGenerating ? t("reportGenerate.generatingButton") : t("reportGenerate.generateButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
