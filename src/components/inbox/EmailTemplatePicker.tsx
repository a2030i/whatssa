import { useState, useEffect } from "react";
import { FileText, Search, Mail, ChevronLeft, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body_html: string;
  is_system: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  welcome: "ترحيب",
  followup: "متابعة",
  ticket: "تذاكر",
  quote: "عروض أسعار",
  thankyou: "شكر",
  reminder: "تذكير",
  general: "عام",
};

const CATEGORY_COLORS: Record<string, string> = {
  welcome: "bg-green-500/10 text-green-600",
  followup: "bg-blue-500/10 text-blue-600",
  ticket: "bg-purple-500/10 text-purple-600",
  quote: "bg-amber-500/10 text-amber-600",
  thankyou: "bg-pink-500/10 text-pink-600",
  reminder: "bg-orange-500/10 text-orange-600",
  general: "bg-muted text-muted-foreground",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (subject: string, bodyHtml: string) => void;
}

export default function EmailTemplatePicker({ open, onOpenChange, onSelect }: Props) {
  const { orgId } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("email_templates")
        .select("*")
        .or(`is_system.eq.true,org_id.eq.${orgId}`)
        .order("category");
      setTemplates(data || []);
    })();
  }, [open, orgId]);

  const filtered = templates.filter(t =>
    !search || t.name.includes(search) || t.subject.includes(search) || t.category.includes(search)
  );

  const handleSelect = (t: EmailTemplate) => {
    setSelectedTemplate(t);
    setEditSubject(t.subject);
    setEditBody(t.body_html.replace(/<[^>]*>/g, "").trim());
  };

  const handleConfirm = () => {
    onSelect(editSubject, editBody);
    setSelectedTemplate(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedTemplate ? (
              <>
                <button onClick={() => setSelectedTemplate(null)} className="p-1 hover:bg-secondary rounded">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <Pencil className="w-4 h-4 text-primary" />
                تعديل القالب
              </>
            ) : (
              <>
                <Mail className="w-4 h-4 text-primary" />
                قوالب البريد الإلكتروني
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {selectedTemplate ? (
          <div className="space-y-4 mt-2">
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">العنوان</label>
                <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="bg-background" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">المحتوى</label>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={6}
                  className="bg-background resize-none"
                />
              </div>
            </div>
            <Button onClick={handleConfirm} className="w-full gap-2">
              <Mail className="w-4 h-4" /> استخدام هذا القالب
            </Button>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في القوالب..."
                className="pr-9"
              />
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد قوالب</p>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  className="w-full text-right bg-secondary/30 hover:bg-secondary/60 rounded-xl p-3.5 transition-colors space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm flex-1">{t.name}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 border-0 ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.general}`}>
                      {CATEGORY_LABELS[t.category] || t.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">📧 {t.subject}</p>
                  <p className="text-xs text-muted-foreground/70 line-clamp-2">
                    {t.body_html.replace(/<[^>]*>/g, "").trim()}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

