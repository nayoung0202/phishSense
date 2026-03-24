"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, FileText, Eye, Sun, Moon, Sparkles } from "lucide-react";
import Link from "next/link";
import { type TrainingPage } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SafeText } from "@/components/security/SafeText";
import { useI18n } from "@/components/I18nProvider";
import { getDateFnsLocale } from "@/lib/i18n";
import { TrainingPageAiGenerateDialog } from "@/components/TrainingPageAiGenerateDialog";
import { TemplatePreviewFrame } from "@/components/template-preview-frame";

export default function TrainingPages() {
  const { t, locale } = useI18n();
  const dateFnsLocale = getDateFnsLocale(locale);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("dark");
  const [isAiGenerateOpen, setIsAiGenerateOpen] = useState(false);

  const { data: pages = [], isLoading } = useQuery<TrainingPage[]>({
    queryKey: ["/api/training-pages"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/training-pages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-pages"] });
    },
  });

  const filteredPages = pages.filter((page) =>
    page.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    page.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = (id: string) => {
    if (confirm(t("정말 삭제하시겠습니까?"))) {
      deleteMutation.mutate(id);
    }
  };

  const formatDate = (date: Date | string) => {
    return format(new Date(date), "PPp", { locale: dateFnsLocale });
  };

  const previewSurfaceClass =
    previewTheme === "dark"
      ? "site-scrollbar rounded-md border border-slate-800 bg-slate-950 p-2 text-slate-50"
      : "site-scrollbar rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-900";
  const previewScrollableSurfaceClass = `${previewSurfaceClass} max-h-[60vh] overflow-y-auto`;

  return (
    <>
    <TrainingPageAiGenerateDialog
      open={isAiGenerateOpen}
      onOpenChange={setIsAiGenerateOpen}
    />
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">{t("훈련 안내 페이지 관리")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            data-testid="button-ai-training-page-create"
            onClick={() => setIsAiGenerateOpen(true)}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {t("AI 훈련안내페이지 생성")}
          </Button>
          <Link href="/training-pages/new">
            <Button data-testid="button-new-page">
              <Plus className="w-4 h-4 mr-2" />
              {t("새 안내 페이지 생성")}
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-6">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("페이지명으로 검색...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-12">{t("common.loading")}</div>
        ) : filteredPages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("안내 페이지가 없습니다")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPages.map((page) => (
              <Card key={page.id} className="p-6 hover-elevate" data-testid={`card-page-${page.id}`}>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-primary/10">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="mb-1 font-semibold truncate">
                        <SafeText value={page.name} fallback="-" />
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        <SafeText value={page.description} fallback={t("설명 없음")} />
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-3">
                      {t("최근 수정:")} {formatDate(page.updatedAt!)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" data-testid={`button-preview-${page.id}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            {t("미리보기")}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <DialogTitle>
                                <SafeText value={page.name} fallback="-" />
                              </DialogTitle>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className={previewTheme === "light" ? "text-foreground font-semibold" : ""}>{t("라이트")}</span>
                                <Switch
                                  checked={previewTheme === "dark"}
                                  onCheckedChange={(checked) => setPreviewTheme(checked ? "dark" : "light")}
                                  aria-label={t("미리보기 테마 전환")}
                                  thumbIcon={
                                    previewTheme === "dark" ? (
                                      <Moon className="h-3 w-3" />
                                    ) : (
                                      <Sun className="h-3 w-3" />
                                    )
                                  }
                                />
                                <span className={previewTheme === "dark" ? "text-foreground font-semibold" : ""}>{t("다크")}</span>
                              </div>
                            </div>
                          </DialogHeader>
                          <div className={previewScrollableSurfaceClass}>
                            <TemplatePreviewFrame
                              html={page.content}
                              theme={previewTheme}
                              className="rounded-md shadow-sm"
                            />
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Link href={`/training-pages/${page.id}/edit`}>
                        <Button variant="outline" size="sm" data-testid={`button-edit-${page.id}`}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(page.id)}
                        data-testid={`button-delete-${page.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
    </>
  );
}
