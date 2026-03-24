"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Edit, Trash2, Upload, Download, Loader2 } from "lucide-react";
import { type Target } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { SafeText } from "@/components/security/SafeText";
import { importTrainingTargetsExcel, type ImportTrainingTargetsResponse } from "@/lib/api";
import { useI18n } from "@/components/I18nProvider";
import { getIntlLocale } from "@/lib/i18n";
import {
  resolveDisplayedTargetSeatLimit,
  type PlatformSeatContext,
  TargetSeatUsageSummary,
} from "@/components/targets/TargetSeatUsageSummary";

const parseDepartments = (department: Target["department"]): string[] => {
  if (!department) return [];
  if (Array.isArray(department)) {
    return department.map((dept) => dept.trim()).filter((dept) => dept.length > 0);
  }
  return department
    .split(",")
    .map((dept) => dept.trim())
    .filter((dept) => dept.length > 0);
};

export const normalizeTargetSearchValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const tokenizeTargetSearch = (value: string) =>
  normalizeTargetSearchValue(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

export const isNumericOnlyQuery = (tokens: string[]) => {
  if (tokens.length === 0) return false;
  const joined = tokens.join("");
  return /^[0-9]+$/.test(joined);
};

export const buildTargetNameSearchHaystack = (target: Pick<Target, "name">) =>
  normalizeTargetSearchValue(target.name ?? "");

export const buildTargetSearchHaystack = (
  target: Pick<Target, "name" | "email" | "department" | "tags">,
) => {
  const departments = parseDepartments(target.department).join(" ");
  const tags = (target.tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .join(" ");
  const combined = [target.name ?? "", target.email ?? "", departments, tags]
    .join(" ")
    .trim();
  return normalizeTargetSearchValue(combined);
};

export const filterTargetsBySearch = (targets: Target[], searchTerm: string) => {
  const tokens = tokenizeTargetSearch(searchTerm);
  if (tokens.length === 0) {
    return targets;
  }
  const numericOnly = isNumericOnlyQuery(tokens);
  return targets.filter((target) => {
    const haystack = numericOnly
      ? buildTargetNameSearchHaystack(target)
      : buildTargetSearchHaystack(target);
    return tokens.every((token) => haystack.includes(token));
  });
};

export default function Targets() {
  const { locale, t } = useI18n();
  const intlLocale = getIntlLocale(locale);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] =
    useState<ImportTrainingTargetsResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: targets = [], isLoading } = useQuery<Target[]>({
    queryKey: ["/api/targets"],
  });
  const platformContextQuery = useQuery<PlatformSeatContext>({
    queryKey: ["/api/auth/platform-context"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/targets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/targets"] });
      toast({
        title: t("삭제 완료"),
        description: t("훈련 대상자가 삭제되었습니다."),
      });
    },
  });

  const filteredTargets = useMemo(
    () => filterTargetsBySearch(targets, searchTerm),
    [targets, searchTerm],
  );
  const displayedSeatLimit = resolveDisplayedTargetSeatLimit(platformContextQuery.data);

  const isAllSelected =
    filteredTargets.length > 0 &&
    filteredTargets.every((target) => selectedTargets.includes(target.id));

  const selectAllState: boolean | "indeterminate" =
    selectedTargets.length === 0
      ? false
      : isAllSelected
      ? true
      : "indeterminate";

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTargets(filteredTargets.map(t => t.id));
    } else {
      setSelectedTargets([]);
    }
  };

  const handleSelectTarget = (targetId: string, checked: boolean) => {
    setSelectedTargets((prev) => {
      if (checked) {
        if (prev.includes(targetId)) {
          return prev;
        }
        return [...prev, targetId];
      }
      return prev.filter((id) => id !== targetId);
    });
  };

  const handleDelete = (id: string) => {
    if (confirm(t("정말 삭제하시겠습니까?"))) {
      deleteMutation.mutate(id);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/api/admin/training-targets/template.xlsx", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(t("샘플 템플릿을 다운로드할 수 없습니다."));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "training_targets_template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: t("다운로드 실패"),
        description: error instanceof Error ? error.message : t("샘플 템플릿을 가져오지 못했습니다."),
        variant: "destructive",
      });
    }
  };

  const handleExcelButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleExcelUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast({
        title: t("지원하지 않는 형식"),
        description: t("엑셀(.xlsx) 파일만 업로드할 수 있습니다."),
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }
    setIsImporting(true);
    try {
      const result = await importTrainingTargetsExcel(file);
      setImportResult(result);
      toast({
        title: t("업로드 완료"),
        description:
          locale === "en"
            ? `${result.successCount.toLocaleString(intlLocale)} of ${result.totalRows.toLocaleString(intlLocale)} rows imported`
            : locale === "ja"
              ? `${result.totalRows.toLocaleString(intlLocale)}件中 ${result.successCount.toLocaleString(intlLocale)}件成功`
              : `총 ${result.totalRows.toLocaleString(intlLocale)}건 중 ${result.successCount.toLocaleString(intlLocale)}건 성공`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/targets"] });
    } catch (error) {
      toast({
        title: t("업로드 실패"),
        description: error instanceof Error ? error.message : t("엑셀 업로드에 실패했습니다."),
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">{t("훈련 대상 관리")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            data-testid="button-download-template"
          >
            <Download className="w-4 h-4 mr-2" />
            {t("샘플 엑셀 다운로드")}
          </Button>
          <Button
            variant="outline"
            onClick={handleExcelButtonClick}
            disabled={isImporting}
            data-testid="button-upload-excel"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {t("엑셀 업로드")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleExcelUpload}
          />
          <Link href="/targets/new">
            <Button data-testid="button-add-target">
              <Plus className="w-4 h-4 mr-2" />
              {t("대상자 추가")}
            </Button>
          </Link>
        </div>
      </div>

      <TargetSeatUsageSummary
        usedSeats={targets.length}
        seatLimit={displayedSeatLimit}
        isLoading={platformContextQuery.isLoading}
      />

      <Card className="p-6">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("이름, 이메일, 소속으로 검색...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>

        {importResult && (
          <Card className="mb-4 border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                {locale === "en"
                  ? `${importResult.totalRows.toLocaleString(intlLocale)} rows processed`
                  : locale === "ja"
                    ? `合計 ${importResult.totalRows.toLocaleString(intlLocale)}件処理`
                    : `총 ${importResult.totalRows.toLocaleString(intlLocale)}건 처리`}
              </span>
              <span className="text-emerald-700">
                {locale === "en"
                  ? `${importResult.successCount.toLocaleString(intlLocale)} succeeded`
                  : locale === "ja"
                    ? `成功 ${importResult.successCount.toLocaleString(intlLocale)}件`
                    : `성공 ${importResult.successCount.toLocaleString(intlLocale)}건`}
              </span>
              <span className="text-destructive">
                {locale === "en"
                  ? `${importResult.failCount.toLocaleString(intlLocale)} failed`
                  : locale === "ja"
                    ? `失敗 ${importResult.failCount.toLocaleString(intlLocale)}件`
                    : `실패 ${importResult.failCount.toLocaleString(intlLocale)}건`}
              </span>
            </div>
            {importResult.failures.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber-800">{t("실패 항목")}</p>
                <div className="max-h-40 overflow-auto rounded-md border border-amber-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">{t("행 번호")}</TableHead>
                        <TableHead>{t("이메일")}</TableHead>
                        <TableHead>{t("사유")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.failures.slice(0, 50).map((failure, index) => (
                        <TableRow key={`${failure.rowNumber}-${index}`}>
                          <TableCell>{failure.rowNumber}</TableCell>
                          <TableCell>{failure.email || "-"}</TableCell>
                          <TableCell>{failure.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {importResult.failCount > importResult.failures.length && (
                  <p className="text-xs text-muted-foreground">
                    {locale === "en"
                      ? `Showing up to ${importResult.failures.length.toLocaleString(intlLocale)} rows.`
                      : locale === "ja"
                        ? `最大 ${importResult.failures.length.toLocaleString(intlLocale)}件まで表示します。`
                        : `최대 ${importResult.failures.length.toLocaleString(intlLocale)}건까지만 표시됩니다.`}
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {selectedTargets.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {locale === "en"
                ? `${selectedTargets.length.toLocaleString(intlLocale)} selected`
                : locale === "ja"
                  ? `${selectedTargets.length.toLocaleString(intlLocale)}名選択`
                  : `${selectedTargets.length.toLocaleString(intlLocale)}명 선택됨`}
            </span>
            <Button variant="outline" size="sm" data-testid="button-add-to-group">
              {t("그룹에 추가")}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                const message =
                  locale === "en"
                    ? `Delete ${selectedTargets.length.toLocaleString(intlLocale)} selected targets?`
                    : locale === "ja"
                      ? `${selectedTargets.length.toLocaleString(intlLocale)}名を削除しますか？`
                      : `${selectedTargets.length.toLocaleString(intlLocale)}명을 삭제하시겠습니까?`;
                if (confirm(message)) {
                  selectedTargets.forEach(id => deleteMutation.mutate(id));
                  setSelectedTargets([]);
                }
              }}
              data-testid="button-delete-selected"
            >
              선택 삭제
            </Button>
          </div>
        )}

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectAllState}
                    onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead>{t("이름")}</TableHead>
                <TableHead>{t("이메일")}</TableHead>
                <TableHead>{t("소속")}</TableHead>
                <TableHead>{t("태그")}</TableHead>
                <TableHead>{t("상태")}</TableHead>
                <TableHead className="text-right">{t("액션")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : filteredTargets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t("훈련 대상자가 없습니다")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTargets.map((target) => {
                  const departments = parseDepartments(target.department);
                  return (
                    <TableRow key={target.id} data-testid={`row-target-${target.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedTargets.includes(target.id)}
                          onCheckedChange={(checked) => handleSelectTarget(target.id, Boolean(checked))}
                          data-testid={`checkbox-target-${target.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <SafeText value={target.name} fallback="-" />
                      </TableCell>
                      <TableCell>
                        <SafeText value={target.email} fallback="-" />
                      </TableCell>
                      <TableCell>
                        {departments.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {departments.map((dept) => (
                              <Badge key={`${target.id}-${dept}`} variant="outline" className="text-xs">
                                <SafeText value={dept} fallback="-" />
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {target.tags?.map((tag, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              <SafeText value={tag} fallback="-" />
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                <Badge
                  className={
                    target.status === "inactive"
                      ? "bg-orange-500/20 text-orange-400"
                      : "bg-green-500/20 text-green-400"
                  }
                >
                  {target.status || "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                        <Link href={`/targets/${target.id}/edit`}>
                          <Button variant="ghost" size="sm" data-testid={`button-edit-${target.id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(target.id)}
                            data-testid={`button-delete-${target.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
