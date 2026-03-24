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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, Save } from "lucide-react";
import { type TrainingPage, insertTrainingPageSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  TRAINING_PAGE_AI_DRAFT_SESSION_KEY,
  type TrainingPageAiDraft,
} from "@shared/trainingPageAi";
import { useI18n } from "@/components/I18nProvider";

export default function TrainingPageEdit({ trainingPageId }: { trainingPageId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useI18n();
  const normalizedPageId = trainingPageId ?? "";
  const isNew = normalizedPageId.length === 0;
  const [appliedAiDraftId, setAppliedAiDraftId] = useState<string | null>(null);

  const { data: page } = useQuery<TrainingPage>({
    queryKey: ["/api/training-pages", normalizedPageId],
    enabled: !isNew,
  });

  const form = useForm({
    resolver: zodResolver(insertTrainingPageSchema),
    defaultValues: {
      name: page?.name || "",
      description: page?.description || "",
      content: page?.content || "",
      status: page?.status || "active",
    },
    values: page
      ? {
          name: page.name,
          description: page.description || "",
          content: page.content,
          status: page.status || "active",
        }
      : undefined,
  });
  const contentValue = form.watch("content") ?? "";

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isNew) {
        return await apiRequest("POST", "/api/training-pages", data);
      }
      return await apiRequest("PATCH", `/api/training-pages/${normalizedPageId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-pages"] });
      toast({
        title: t("trainingPageEdit.savedTitle"),
        description: t("trainingPageEdit.savedDescription"),
      });
      router.push("/training-pages");
    },
  });

  const onSubmit = (data: any) => {
    saveMutation.mutate({
      ...data,
      status: "active",
    });
  };

  useEffect(() => {
    if (!isNew || typeof window === "undefined" || appliedAiDraftId) {
      return;
    }

    const rawDraft = window.sessionStorage.getItem(TRAINING_PAGE_AI_DRAFT_SESSION_KEY);
    if (!rawDraft) {
      return;
    }

    let draft: TrainingPageAiDraft;
    try {
      draft = JSON.parse(rawDraft) as TrainingPageAiDraft;
    } catch {
      window.sessionStorage.removeItem(TRAINING_PAGE_AI_DRAFT_SESSION_KEY);
      return;
    }

    const hasExistingContent = [
      form.getValues("name"),
      form.getValues("description"),
      form.getValues("content"),
    ].some((value) => String(value ?? "").trim().length > 0);

    if (
      hasExistingContent &&
      !window.confirm(t("trainingPageEdit.applyDraftConfirm"))
    ) {
      return;
    }

    form.reset({
      name: draft.name,
      description: draft.description,
      content: draft.content,
      status: "active",
    });
    setAppliedAiDraftId(draft.id);
    window.sessionStorage.removeItem(TRAINING_PAGE_AI_DRAFT_SESSION_KEY);
    toast({
      title: t("trainingPageEdit.applyDraftTitle"),
      description: t("trainingPageEdit.applyDraftDescription"),
    });
  }, [appliedAiDraftId, form, isNew, t, toast]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/training-pages">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-4xl font-bold">
            {isNew ? t("trainingPageEdit.createTitle") : t("trainingPageEdit.editTitle")}
          </h1>
        </div>
      </div>

      <Card className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("trainingPageEdit.nameLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("trainingPageEdit.namePlaceholder")} {...field} data-testid="input-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("trainingPageEdit.descriptionLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("trainingPageEdit.descriptionPlaceholder")}
                      {...field}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("trainingPageEdit.contentLabel")}</FormLabel>
                  <FormControl>
                    <div data-testid="editor-content">
                      <RichTextEditor
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        placeholder={t("trainingPageEdit.contentPlaceholder")}
                        previewHtml={contentValue}
                      />
                    </div>
                  </FormControl>
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
              <Link href="/training-pages">
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
