import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TemplatePreviewFrame } from "@/components/template-preview-frame";
import { TEMPLATE_PREVIEW_SANDBOX_CLASS } from "@/lib/templatePreview";
import { useI18n } from "@/components/I18nProvider";
import {
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Strikethrough,
  Image as ImageIcon,
} from "lucide-react";

type Command =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "createLink"
  | "insertImage"
  | "removeFormat";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  previewHtml?: string;
  editTheme?: "default" | "mail-dark-readable" | "malicious-modal";
}

interface ToolbarItem {
  label: string;
  command: Command;
  icon: ReactNode;
}

type EditorMode = "edit" | "html" | "preview";

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  previewHtml,
  editTheme = "default",
}: RichTextEditorProps) {
  const { t } = useI18n();
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<EditorMode>("edit");
  const toolbarItems: ToolbarItem[] = [
    { label: t("richTextEditor.bold"), command: "bold", icon: <Bold className="h-3.5 w-3.5" /> },
    { label: t("richTextEditor.italic"), command: "italic", icon: <Italic className="h-3.5 w-3.5" /> },
    { label: t("richTextEditor.underline"), command: "underline", icon: <Underline className="h-3.5 w-3.5" /> },
    { label: t("richTextEditor.strike"), command: "strikeThrough", icon: <Strikethrough className="h-3.5 w-3.5" /> },
    { label: t("richTextEditor.bulletedList"), command: "insertUnorderedList", icon: <List className="h-3.5 w-3.5" /> },
    { label: t("richTextEditor.numberedList"), command: "insertOrderedList", icon: <ListOrdered className="h-3.5 w-3.5" /> },
  ];

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (mode !== "edit") return;
    if (editor.innerHTML !== value) {
      editor.innerHTML = value || "";
    }
  }, [value, mode]);

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(editor.innerHTML);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items?.length) {
      return;
    }
    const imageItems = Array.from(items).filter((item) =>
      item.type.startsWith("image/"),
    );
    if (imageItems.length === 0) {
      return;
    }

    event.preventDefault();

    imageItems.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        document.execCommand("insertImage", false, reader.result as string);
        onChange(editor.innerHTML);
      };
      reader.readAsDataURL(file);
    });
  };

  const applyCommand = (command: Command) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    if (command === "createLink") {
      const url = window.prompt(t("richTextEditor.linkPrompt"));
      if (!url) return;
      document.execCommand("createLink", false, url);
    } else if (command === "insertImage") {
      const url = window.prompt(t("richTextEditor.imagePrompt"));
      if (!url) return;
      document.execCommand("insertImage", false, url);
    } else {
      document.execCommand(command, false);
    }

    onChange(editor.innerHTML);
  };

  const editSurfaceClassName =
    editTheme === "mail-dark-readable"
      ? "template-editor-dark-readable"
      : editTheme === "malicious-modal"
        ? "template-editor-malicious-modal"
        : "";

  return (
    <div className={cn("overflow-visible rounded-md border border-border bg-background", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-2">
        {toolbarItems.map((item) => (
          <Button
            key={item.command}
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={item.label}
            disabled={mode !== "edit"}
            onMouseDown={(event) => {
              event.preventDefault();
              applyCommand(item.command);
            }}
          >
            {item.icon}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t("richTextEditor.link")}
          disabled={mode !== "edit"}
          onMouseDown={(event) => {
            event.preventDefault();
            applyCommand("createLink");
          }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t("richTextEditor.image")}
          disabled={mode !== "edit"}
          onMouseDown={(event) => {
            event.preventDefault();
            applyCommand("insertImage");
          }}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t("richTextEditor.clearFormatting")}
          disabled={mode !== "edit"}
          onMouseDown={(event) => {
            event.preventDefault();
            applyCommand("removeFormat");
          }}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {(["edit", "html", "preview"] as EditorMode[]).map((item) => (
            <Button
              key={item}
              type="button"
              variant={mode === item ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3 text-xs font-semibold"
              onMouseDown={(event) => {
                event.preventDefault();
                setMode(item);
              }}
            >
              {item === "edit"
                ? t("richTextEditor.modeEdit")
                : item === "html"
                  ? "HTML"
                  : t("richTextEditor.modePreview")}
            </Button>
          ))}
        </div>
      </div>
      {mode === "html" ? (
        <textarea
          key="rich-text-html"
          className="editor-scrollbar min-h-[300px] max-h-[600px] w-full resize-none border-t border-border bg-background p-4 font-mono text-sm focus:outline-none"
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onBlur?.()}
          placeholder={placeholder}
        />
      ) : mode === "preview" ? (
        <div key="rich-text-preview" className="border-t border-border bg-muted/30 p-2 overflow-visible">
          {(previewHtml ?? value).trim().length > 0 ? (
            <TemplatePreviewFrame
              html={previewHtml ?? value}
              className="rounded-md shadow-sm"
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{t("richTextEditor.emptyPreview")}</p>
          )}
        </div>
      ) : (
        <div
          key="rich-text-edit"
          ref={editorRef}
          className={cn(
            "editor-scrollbar min-h-[300px] overflow-visible bg-background p-4 text-sm focus:outline-none",
            editSurfaceClassName,
            TEMPLATE_PREVIEW_SANDBOX_CLASS,
          )}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          data-placeholder={placeholder}
          onInput={handleInput}
          onBlur={() => {
            handleInput();
            onBlur?.();
          }}
          onPaste={handlePaste}
        />
      )}
    </div>
  );
}
