"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2, Mail, Eye, Sun, Moon, Sparkles } from "lucide-react";
import Link from "next/link";
import { type Template } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SafeText } from "@/components/security/SafeText";
import { useI18n } from "@/components/I18nProvider";
import { getDateFnsLocale } from "@/lib/i18n";
import { buildMailHtml } from "@shared/templateMail";
import { cn } from "@/lib/utils";
import { TemplateAiGenerateDialog } from "@/components/TemplateAiGenerateDialog";
import { TemplatePreviewFrame } from "@/components/template-preview-frame";
import { paginateItems } from "@/lib/pagination";
import { ListPaginationControls } from "@/components/ListPaginationControls";
import {
  countTokenOccurrences,
  MAIL_LANDING_TOKENS,
  MALICIOUS_TRAINING_TOKENS,
  normalizeTrainingUrlPlaceholders,
} from "@shared/templateTokens";

const TEMPLATES_PAGE_SIZE = 9;

export default function Templates() {
  const { locale, t } = useI18n();
  const dateFnsLocale = getDateFnsLocale(locale);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAiGenerateOpen, setIsAiGenerateOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("dark");

  const getSnippet = (html: string, size = 80) => {
    const plain = html
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length <= size) {
      return plain;
    }
    return `${plain.slice(0, size)}...`;
  };

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
    },
  });

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const keyword = searchTerm.toLowerCase();
        if (!keyword) return true;
        return (
          template.name.toLowerCase().includes(keyword) ||
          template.subject.toLowerCase().includes(keyword) ||
          template.body.toLowerCase().includes(keyword) ||
          template.maliciousPageContent.toLowerCase().includes(keyword)
        );
      }),
    [searchTerm, templates],
  );
  const paginatedTemplates = useMemo(
    () => paginateItems(filteredTemplates, page, TEMPLATES_PAGE_SIZE),
    [filteredTemplates, page],
  );
  const visibleTemplates = paginatedTemplates.items;

  const handleDelete = (id: string) => {
    if (confirm(t("common.confirmDelete"))) {
      deleteMutation.mutate(id);
    }
  };

  const handleOpenPreview = (template: Template) => {
    setPreviewTemplate(template);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewTemplate(null);
  };

  const formatDate = (date: Date | string) => {
    return format(new Date(date), "PPp", { locale: dateFnsLocale });
  };

  const previewLandingUrl = "/example-domain?type=landing";
  const previewOpenPixelUrl = "https://example.com/o/preview.gif";
  const previewTrainingUrl = "/example-domain?type=training";
  const previewSubmitUrl = "/example-domain?type=submit";
  const previewTrainingTokenMatcher = /\{\{\s*TRAINING_URL\s*\}\}/i;
  const previewTrainingTokenReplacer = /\{\{\s*TRAINING_URL\s*\}\}/gi;
  const previewSubmitTokenMatcher = /\{\{\s*SUBMIT_URL\s*\}\}/i;
  const previewSubmitTokenReplacer = /\{\{\s*SUBMIT_URL\s*\}\}/gi;
  const previewMailResult = previewTemplate
    ? buildMailHtml(previewTemplate, previewLandingUrl, previewOpenPixelUrl)
    : null;
  const previewBody = previewMailResult?.html ?? "";
  const previewMaliciousRaw = normalizeTrainingUrlPlaceholders(
    previewTemplate?.maliciousPageContent ?? "",
  );
  const previewMaliciousHasTrainingToken = previewTrainingTokenMatcher.test(previewMaliciousRaw);
  const previewMaliciousHasSubmitToken = previewSubmitTokenMatcher.test(previewMaliciousRaw);
  const previewMalicious = previewMaliciousRaw
    .replace(previewTrainingTokenReplacer, previewTrainingUrl)
    .replace(previewSubmitTokenReplacer, previewSubmitUrl);
  const previewSurfaceClass =
    previewTheme === "dark"
      ? "site-scrollbar rounded-md border border-slate-800 bg-slate-950 p-2 text-slate-50"
      : "site-scrollbar rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-900";
  const previewScrollableSurfaceClass = cn(
    previewSurfaceClass,
    "max-h-[60vh] overflow-y-auto",
  );
  const previewMutedClass =
    previewTheme === "dark" ? "text-slate-300" : "text-slate-600";

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (paginatedTemplates.page !== page) {
      setPage(paginatedTemplates.page);
    }
  }, [page, paginatedTemplates.page]);

  return (
    <>
      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleClosePreview();
          } else {
            setIsPreviewOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-3xl" data-testid="dialog-template-preview">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name ?? t("templates.previewTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {previewTemplate?.subject ?? t("templates.noSubject")}
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className={previewTheme === "light" ? "text-foreground font-semibold" : ""}>{t("common.light")}</span>
                <Switch
                  checked={previewTheme === "dark"}
                  onCheckedChange={(checked) => setPreviewTheme(checked ? "dark" : "light")}
                  aria-label={t("common.previewThemeToggle")}
                  thumbIcon={
                    previewTheme === "dark" ? (
                      <Moon className="h-3 w-3" />
                    ) : (
                      <Sun className="h-3 w-3" />
                    )
                  }
                />
                <span className={previewTheme === "dark" ? "text-foreground font-semibold" : ""}>{t("common.dark")}</span>
              </div>
            </div>
            <Tabs defaultValue="body" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="body">{t("templates.emailBody")}</TabsTrigger>
                <TabsTrigger value="malicious">{t("templates.maliciousBody")}</TabsTrigger>
              </TabsList>
              <TabsContent value="body">
                <div className={previewScrollableSurfaceClass}>
                  {previewTemplate ? (
                    previewBody.trim().length > 0 ? (
                      <TemplatePreviewFrame
                        html={previewBody}
                        theme={previewTheme}
                        className="rounded-md shadow-sm"
                      />
                    ) : (
                      <p className={`text-sm ${previewMutedClass}`}>{t("templates.noEmailBody")}</p>
                    )
                  ) : (
                    <p className={`text-sm ${previewMutedClass}`}>{t("templates.selectPreview")}</p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="malicious">
                {previewTemplate && (previewMaliciousHasTrainingToken || previewMaliciousHasSubmitToken) && (
                  <p className={`mb-2 text-xs ${previewMutedClass}`}>
                    {t("templates.linksReplaced")}
                  </p>
                )}
                <div className={previewScrollableSurfaceClass}>
                  {previewTemplate ? (
                    previewMalicious.trim().length > 0 ? (
                      <TemplatePreviewFrame
                        html={previewMalicious}
                        theme={previewTheme}
                        className="rounded-md shadow-sm"
                      />
                    ) : (
                      <p className={`text-sm ${previewMutedClass}`}>{t("templates.noMaliciousBody")}</p>
                    )
                  ) : (
                    <p className={`text-sm ${previewMutedClass}`}>{t("templates.selectPreview")}</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
      <TemplateAiGenerateDialog
        open={isAiGenerateOpen}
        onOpenChange={setIsAiGenerateOpen}
      />
      <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">{t("templates.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            data-testid="button-ai-template-create"
            onClick={() => setIsAiGenerateOpen(true)}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {t("templates.generateAi")}
          </Button>
          <Link href="/templates/new">
            <Button data-testid="button-new-template">
              <Plus className="w-4 h-4 mr-2" />
              {t("templates.create")}
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-6">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("templates.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-12">{t("common.loading")}</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("templates.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleTemplates.map((template) => {
              const landingTokenCount = countTokenOccurrences(
                template.body ?? "",
                MAIL_LANDING_TOKENS,
              );
              const trainingTokenCount = countTokenOccurrences(
                template.maliciousPageContent ?? "",
                MALICIOUS_TRAINING_TOKENS,
              );
              const mailStatus = landingTokenCount >= 1 ? "ok" : "missing";
              const maliciousStatus = trainingTokenCount >= 1 ? "ok" : "missing";
              const isInvalid = mailStatus !== "ok" || maliciousStatus !== "ok";

              return (
                <Card key={template.id} className="p-6 hover-elevate" data-testid={`card-template-${template.id}`}>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-md bg-primary/10">
                        <Mail className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold mb-1 truncate">
                          <SafeText value={template.name} fallback="-" />
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          <SafeText value={template.subject} fallback="-" />
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{t("templates.emailBody")}</p>
                        <p>
                          <SafeText value={getSnippet(template.body)} fallback="-" />
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{t("templates.maliciousBody")}</p>
                        <p>
                          <SafeText value={getSnippet(template.maliciousPageContent)} fallback="-" />
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          mailStatus === "ok"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }
                      >
                        {t("templates.emailStatus", {
                          status:
                            mailStatus === "ok"
                              ? t("templates.statusIncluded")
                              : t("templates.statusMissing"),
                        })}
                      </Badge>
                      <Badge
                        className={
                          maliciousStatus === "ok"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }
                      >
                        {t("templates.maliciousStatus", {
                          status:
                            maliciousStatus === "ok"
                              ? t("templates.statusIncluded")
                              : t("templates.statusMissing"),
                        })}
                      </Badge>
                      {isInvalid && (
                        <span className="text-xs text-muted-foreground">
                          {t("templates.cannotSaveOrSend")}
                        </span>
                      )}
                    </div>

                    <div className="pt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-3">
                        {t("common.updatedAt")} {formatDate(template.updatedAt!)}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPreview(template)}
                          data-testid={`button-preview-${template.id}`}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          {t("common.preview")}
                        </Button>
                        <Link href={`/templates/${template.id}/edit`}>
                          <Button variant="outline" size="sm" data-testid={`button-edit-${template.id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(template.id)}
                          data-testid={`button-delete-${template.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        <ListPaginationControls
          page={paginatedTemplates.page}
          totalPages={paginatedTemplates.totalPages}
          onPageChange={setPage}
          previousLabel={locale === "en" ? "Previous" : locale === "ja" ? "前へ" : "이전"}
          nextLabel={locale === "en" ? "Next" : locale === "ja" ? "次へ" : "다음"}
        />
      </Card>
    </div>
    </>
  );
}
