import { Card } from "@/components/ui/card";
import { Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";

interface TemplateCardProps {
  id: string;
  title: string;
  lastModified: string;
  subject: string;
}

export function TemplateCard({ id, title, lastModified, subject }: TemplateCardProps) {
  const { t } = useI18n();
  const handleEdit = () => {
    console.log(`Edit template ${id} triggered`);
  };

  return (
    <Card className="p-6 hover-elevate group" data-testid={`card-template-${id}`}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold mb-1 truncate" data-testid={`text-template-title-${id}`}>{title}</h3>
            <p className="text-sm text-muted-foreground truncate">{subject}</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{lastModified}</span>
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleEdit}
            data-testid={`button-edit-template-${id}`}
          >
            {t("common.edit")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
