"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, Save } from "lucide-react";
import { type Template, insertTemplateSchema } from "@shared/schema";
import {
  extractTemplateTokens,
  findUnknownTokens,
  countTokenOccurrences,
  MAIL_ALLOWED_TOKENS,
  MAIL_LANDING_TOKENS,
  MALICIOUS_ALLOWED_TOKENS,
  MALICIOUS_TRAINING_TOKENS,
  normalizeTrainingUrlPlaceholders,
} from "@shared/templateTokens";
import {
  buildAutoInsertBlock,
  buildMailHtml,
  resolveAutoInsertConfig,
} from "@shared/templateMail";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { neutralizePreviewModalHtml } from "@/lib/templatePreview";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/I18nProvider";
import {
  TEMPLATE_AI_DRAFT_SESSION_KEY,
  type TemplateAiDraft,
} from "@shared/templateAi";

const normalizeAiDraftForEditor = (html: string) =>
  neutralizePreviewModalHtml(html)
    .replace(/<style\b[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\sstyle=(["'])([\s\S]*?)\1/gi, (_match, quote: string, rawStyle: string) => {
      const nextStyle = rawStyle
        .replace(/(?:^|;)\s*position\s*:\s*fixed\s*(?=;|$)/gi, "")
        .replace(/(?:^|;)\s*inset\s*:\s*0\s*(?=;|$)/gi, "")
        .replace(/(?:^|;)\s*top\s*:\s*0\s*(?=;|$)/gi, "")
        .replace(/(?:^|;)\s*right\s*:\s*0\s*(?=;|$)/gi, "")
        .replace(/(?:^|;)\s*bottom\s*:\s*0\s*(?=;|$)/gi, "")
        .replace(/(?:^|;)\s*left\s*:\s*0\s*(?=;|$)/gi, "")
        .replace(/^\s*;\s*|\s*;\s*$/g, "")
        .trim();

      return nextStyle ? ` style=${quote}${nextStyle}${quote}` : "";
    })
    .replace(/\sclass=(["'])([\s\S]*?)\1/gi, (_match, quote: string, rawClassName: string) => {
      const nextClassName = rawClassName
        .split(/\s+/)
        .filter(Boolean)
        .filter((className) => className !== "fixed" && className !== "inset-0")
        .join(" ");

      return nextClassName ? ` class=${quote}${nextClassName}${quote}` : "";
    })
    .trim();

export default function TemplateEdit({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { toast } = useToast();
  const normalizedTemplateId = templateId ?? "";
  const isNew = normalizedTemplateId.length === 0;
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [appliedAiDraftId, setAppliedAiDraftId] = useState<string | null>(null);
  const [trainingLinkLabel, setTrainingLinkLabel] = useState(t("templateEdit.trainingLinkDefaultLabel"));
  const [trainingLinkKind, setTrainingLinkKind] = useState<"link" | "button">("link");
  const [trainingLinkNewTab, setTrainingLinkNewTab] = useState(true);

  const { data: template } = useQuery<Template>({
    queryKey: ["/api/templates", normalizedTemplateId],
    enabled: !isNew,
  });

  const form = useForm({
    resolver: zodResolver(insertTemplateSchema),
    defaultValues: {
      name: template?.name || "",
      subject: template?.subject || "",
      body: template?.body || "",
      maliciousPageContent: template?.maliciousPageContent || "",
      autoInsertLandingEnabled: template?.autoInsertLandingEnabled ?? true,
      autoInsertLandingLabel: template?.autoInsertLandingLabel ?? t("templateEdit.landingLinkDefaultLabel"),
      autoInsertLandingKind: template?.autoInsertLandingKind ?? "link",
      autoInsertLandingNewTab: template?.autoInsertLandingNewTab ?? true,
    },
    values: template ? {
      name: template.name,
      subject: template.subject,
      body: template.body,
      maliciousPageContent: template.maliciousPageContent,
      autoInsertLandingEnabled: template.autoInsertLandingEnabled ?? true,
      autoInsertLandingLabel: template.autoInsertLandingLabel ?? t("templateEdit.landingLinkDefaultLabel"),
      autoInsertLandingKind: template.autoInsertLandingKind ?? "link",
      autoInsertLandingNewTab: template.autoInsertLandingNewTab ?? true,
    } : undefined,
  });

  const bodyValue = form.watch("body") ?? "";
  const maliciousValue = form.watch("maliciousPageContent") ?? "";
  const autoInsertLabel = form.watch("autoInsertLandingLabel") ?? t("templateEdit.landingLinkDefaultLabel");
  const autoInsertKind = form.watch("autoInsertLandingKind") ?? "link";
  const autoInsertNewTab = form.watch("autoInsertLandingNewTab") ?? true;
  const mailTokens = extractTemplateTokens(bodyValue);
  const landingTokenCount = countTokenOccurrences(bodyValue, MAIL_LANDING_TOKENS);
  const hasLandingToken = landingTokenCount > 0;
  const isLandingTokenMissing = landingTokenCount === 0;
  const unknownMailTokens = findUnknownTokens(mailTokens, MAIL_ALLOWED_TOKENS);
  const maliciousTokens = extractTemplateTokens(maliciousValue);
  const trainingTokenCount = countTokenOccurrences(maliciousValue, MALICIOUS_TRAINING_TOKENS);
  const hasTrainingToken = trainingTokenCount > 0;
  const isTrainingTokenMissing = trainingTokenCount === 0;
  const unknownMaliciousTokens = findUnknownTokens(maliciousTokens, MALICIOUS_ALLOWED_TOKENS);
  const isMaliciousEmpty = maliciousValue.trim().length === 0;
  const showLandingValidation = saveAttempted && isLandingTokenMissing;
  const showTrainingValidation = saveAttempted && isTrainingTokenMissing;
  const isSaveBlocked = isLandingTokenMissing || isTrainingTokenMissing;
  const previewLandingUrl = "/example-domain?type=landing";
  const previewOpenPixelUrl = "https://example.com/o/preview.gif";
  const previewTrainingUrl = "/example-domain?type=training";
  const previewSubmitUrl = "/example-domain?type=submit";
  const previewTrainingTokenReplacer = /\{\{\s*TRAINING_URL\s*\}\}/gi;
  const previewSubmitTokenReplacer = /\{\{\s*SUBMIT_URL\s*\}\}/gi;
  const previewMailHtml = buildMailHtml(
    {
      body: bodyValue,
      autoInsertLandingEnabled: false,
      autoInsertLandingLabel: autoInsertLabel,
      autoInsertLandingKind: autoInsertKind,
      autoInsertLandingNewTab: autoInsertNewTab,
    },
    previewLandingUrl,
    previewOpenPixelUrl,
  ).html;
  const previewMaliciousHtml = normalizeTrainingUrlPlaceholders(maliciousValue)
    .replace(previewTrainingTokenReplacer, previewTrainingUrl)
    .replace(previewSubmitTokenReplacer, previewSubmitUrl);
  const handleInsertLandingLink = () => {
    const currentBody = form.getValues("body") ?? "";
    if (countTokenOccurrences(currentBody, MAIL_LANDING_TOKENS) > 0) {
      return;
    }
    const config = resolveAutoInsertConfig({
      autoInsertLandingEnabled: form.getValues("autoInsertLandingEnabled"),
      autoInsertLandingLabel: form.getValues("autoInsertLandingLabel"),
      autoInsertLandingKind: form.getValues("autoInsertLandingKind"),
      autoInsertLandingNewTab: form.getValues("autoInsertLandingNewTab"),
    });
    const block = buildAutoInsertBlock("{{LANDING_URL}}", config);
    const separator = currentBody.endsWith("\n") ? "\n" : "\n\n";
    const nextBody = currentBody ? `${currentBody}${separator}${block}` : block;
    form.setValue("body", nextBody, { shouldDirty: true, shouldTouch: true });
  };
  const handleInsertTrainingLink = () => {
    const currentBody = form.getValues("maliciousPageContent") ?? "";
    if (countTokenOccurrences(currentBody, MALICIOUS_TRAINING_TOKENS) > 0) {
      return;
    }
    const normalizedLabel = trainingLinkLabel.trim() || t("templateEdit.trainingLinkDefaultLabel");
    const config = {
      enabled: true,
      label: normalizedLabel,
      kind: trainingLinkKind,
      newTab: trainingLinkNewTab,
    };
    const block = buildAutoInsertBlock("{{TRAINING_URL}}", config);
    const separator = currentBody.endsWith("\n") ? "\n" : "\n\n";
    const nextBody = currentBody ? `${currentBody}${separator}${block}` : block;
    form.setValue("maliciousPageContent", nextBody, { shouldDirty: true, shouldTouch: true });
  };

  useEffect(() => {
    if (!isNew || typeof window === "undefined" || appliedAiDraftId) {
      return;
    }

    const rawDraft = window.sessionStorage.getItem(TEMPLATE_AI_DRAFT_SESSION_KEY);
    if (!rawDraft) {
      return;
    }

    let draft: TemplateAiDraft;
    try {
      draft = JSON.parse(rawDraft) as TemplateAiDraft;
    } catch {
      window.sessionStorage.removeItem(TEMPLATE_AI_DRAFT_SESSION_KEY);
      return;
    }

    const hasExistingContent = [
      form.getValues("name"),
      form.getValues("subject"),
      form.getValues("body"),
      form.getValues("maliciousPageContent"),
    ].some((value) => String(value ?? "").trim().length > 0);

    if (
      hasExistingContent &&
      !window.confirm(t("templateEdit.applyDraftConfirm"))
    ) {
      return;
    }

    form.reset({
      name: draft.subject,
      subject: draft.subject,
      body: normalizeAiDraftForEditor(draft.body),
      maliciousPageContent: normalizeAiDraftForEditor(draft.maliciousPageContent),
      autoInsertLandingEnabled: true,
      autoInsertLandingLabel: t("templateEdit.landingLinkDefaultLabel"),
      autoInsertLandingKind: "link",
      autoInsertLandingNewTab: true,
    });
    setAppliedAiDraftId(draft.id);
    window.sessionStorage.removeItem(TEMPLATE_AI_DRAFT_SESSION_KEY);
    toast({
      title: t("templateEdit.applyDraftTitle"),
      description: t("templateEdit.applyDraftDescription"),
    });
  }, [appliedAiDraftId, form, isNew, t, toast]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isNew) {
        return await apiRequest("POST", "/api/templates", data);
      }
      return await apiRequest("PATCH", `/api/templates/${normalizedTemplateId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: t("templateEdit.savedTitle"),
        description: t("templateEdit.savedDescription"),
      });
      router.push("/templates");
    },
  });

  const onSubmit = (data: any) => {
    setSaveAttempted(true);
    if (isSaveBlocked) {
      toast({
        title: t("templateEdit.requiredLinksTitle"),
        description: t("templateEdit.requiredLinksDescription"),
      });
      return;
    }
    saveMutation.mutate(data);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/templates">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-4xl font-bold">
            {isNew ? t("templateEdit.createTitle") : t("templateEdit.editTitle")}
          </h1>
        </div>
      </div>

      <Card className="p-6">
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("templateEdit.nameLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("templateEdit.namePlaceholder")} {...field} data-testid="input-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("templateEdit.subjectLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("templateEdit.subjectPlaceholder")} {...field} data-testid="input-subject" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div
              className={cn(
                "space-y-3 rounded-lg border p-4",
                showLandingValidation ? "border-red-500 bg-red-50/40" : "border-dashed bg-muted/30",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {hasLandingToken ? (
                  <Badge className="bg-emerald-100 text-emerald-700">{t("templateEdit.requiredLinkIncluded")}</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-700">{t("templateEdit.requiredLinkMissing")}</Badge>
                )}
                {unknownMailTokens.length > 0 && (
                  <Badge className="bg-red-100 text-red-700">
                    {t("templateEdit.disallowedTokens", { tokens: unknownMailTokens.join(", ") })}
                  </Badge>
                )}
              </div>
              {isLandingTokenMissing && (
                <p className="text-xs text-muted-foreground">
                  {t("templateEdit.landingLinkHint")}
                </p>
              )}

              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="autoInsertLandingLabel"
                    render={({ field }) => (
                      <FormItem>
                        <Label>{t("templateEdit.linkLabel")}</Label>
                        <FormControl>
                          <Input placeholder={t("templateEdit.landingLinkDefaultLabel")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoInsertLandingKind"
                    render={({ field }) => (
                      <FormItem>
                        <Label>{t("templateEdit.linkTypeLabel")}</Label>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("templateEdit.linkTypePlaceholder")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="link">{t("templateEdit.linkTypeText")}</SelectItem>
                            <SelectItem value="button">{t("templateEdit.linkTypeButton")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoInsertLandingNewTab"
                    render={({ field }) => (
                      <FormItem className="flex h-full flex-col justify-between">
                        <Label>{t("templateEdit.openInNewTabLabel")}</Label>
                        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <span className="text-sm text-muted-foreground">
                            {t("templateEdit.openInNewTabDescription")}
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleInsertLandingLink}
                    disabled={!isLandingTokenMissing}
                  >
                    {t("templateEdit.insertRequiredLink")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {isLandingTokenMissing
                      ? t("templateEdit.insertLandingHint")
                      : t("templateEdit.alreadyIncluded")}
                  </span>
                </div>
              </div>

              {showLandingValidation && (
                <p className="text-xs text-red-600">
                  {t("templateEdit.missingLandingToken")}
                </p>
              )}
            </div>

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("templateEdit.bodyLabel")}</FormLabel>
                  <FormControl>
                    <div data-testid="editor-body">
                      <RichTextEditor
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        placeholder={t("templateEdit.bodyPlaceholder")}
                        previewHtml={previewMailHtml}
                        editTheme="mail-dark-readable"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maliciousPageContent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("templateEdit.maliciousBodyLabel")}</FormLabel>
                  <div
                    className={cn(
                      "space-y-3 rounded-lg border p-4",
                      showTrainingValidation
                        ? "border-red-500 bg-red-50/40"
                        : "border-dashed bg-muted/30",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {hasTrainingToken ? (
                        <Badge className="bg-emerald-100 text-emerald-700">{t("templateEdit.requiredLinkIncluded")}</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700">{t("templateEdit.requiredLinkMissing")}</Badge>
                      )}
                      {isMaliciousEmpty && (
                        <Badge className="bg-red-100 text-red-700">
                          {t("templateEdit.emptyMaliciousBody")}
                        </Badge>
                      )}
                      {unknownMaliciousTokens.length > 0 && (
                        <Badge className="bg-red-100 text-red-700">
                          {t("templateEdit.disallowedTokens", { tokens: unknownMaliciousTokens.join(", ") })}
                        </Badge>
                      )}
                    </div>
                    {isTrainingTokenMissing && (
                      <p className="text-xs text-muted-foreground">
                        {t("templateEdit.trainingLinkHint")}
                      </p>
                    )}
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>{t("templateEdit.linkLabel")}</Label>
                        <Input
                          placeholder={t("templateEdit.trainingLinkDefaultLabel")}
                          value={trainingLinkLabel}
                          onChange={(event) => setTrainingLinkLabel(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("templateEdit.linkTypeLabel")}</Label>
                        <Select
                          onValueChange={(value) =>
                            setTrainingLinkKind(value === "button" ? "button" : "link")
                          }
                          value={trainingLinkKind}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("templateEdit.linkTypePlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="link">{t("templateEdit.linkTypeText")}</SelectItem>
                            <SelectItem value="button">{t("templateEdit.linkTypeButton")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("templateEdit.openInNewTabLabel")}</Label>
                        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                          <Switch
                            checked={trainingLinkNewTab}
                            onCheckedChange={setTrainingLinkNewTab}
                          />
                          <span className="text-sm text-muted-foreground">
                            {t("templateEdit.openInNewTabDescription")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleInsertTrainingLink}
                        disabled={!isTrainingTokenMissing}
                      >
                        {t("templateEdit.insertRequiredLink")}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {isTrainingTokenMissing
                          ? t("templateEdit.insertTrainingHint")
                          : t("templateEdit.alreadyIncluded")}
                      </span>
                    </div>
                    {showTrainingValidation && (
                      <p className="text-xs text-red-600">
                        {t("templateEdit.missingTrainingToken")}
                      </p>
                    )}
                    <FormControl>
                      <div data-testid="editor-malicious">
                        <RichTextEditor
                          value={field.value || ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder={t("templateEdit.maliciousBodyPlaceholder")}
                          previewHtml={previewMaliciousHtml}
                          editTheme="malicious-modal"
                        />
                      </div>
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-4 pt-4">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveMutation.isPending ? t("common.saveProgress") : t("common.save")}
              </Button>
              <Link href="/templates">
                <Button type="button" variant="outline" data-testid="button-cancel">
                  {t("common.cancel")}
                </Button>
              </Link>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}
