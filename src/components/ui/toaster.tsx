import { useToast } from "@/hooks/use-toast"
import { useI18n } from "@/components/I18nProvider"
import { getMessages, type TranslationKey } from "@/lib/i18n"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()
  const { locale, t } = useI18n()
  const messages = getMessages(locale)
  const translateMaybe = (value: string) =>
    value in messages ? t(value as TranslationKey) : value

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{typeof title === "string" ? translateMaybe(title) : title}</ToastTitle>}
              {description && (
                <ToastDescription>
                  {typeof description === "string" ? translateMaybe(description) : description}
                </ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
