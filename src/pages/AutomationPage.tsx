import { Bot, Plus, Zap, Clock, MessageCircle, ArrowLeftRight, Trash2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const automationRules = [
  {
    id: "1",
    name: "رد تلقائي - ترحيب",
    trigger: "كلمة مفتاحية: مرحبا، السلام",
    action: "إرسال رسالة ترحيب + قائمة الخدمات",
    enabled: true,
    type: "keyword" as const,
  },
  {
    id: "2",
    name: "خارج أوقات الدوام",
    trigger: "بعد 5:00 مساءً - قبل 9:00 صباحاً",
    action: "إرسال رسالة: نحن خارج أوقات الدوام، سنرد عليك أول شيء غداً",
    enabled: true,
    type: "schedule" as const,
  },
  {
    id: "3",
    name: "استفسار الشحن",
    trigger: "كلمة مفتاحية: شحن، توصيل، طلب",
    action: "استدعاء API الشحن → إرسال حالة الطلب تلقائياً",
    enabled: false,
    type: "api" as const,
  },
  {
    id: "4",
    name: "تحويل للدعم الفني",
    trigger: "كلمة مفتاحية: مشكلة، عطل، خطأ",
    action: "تحويل المحادثة تلقائياً لفريق الدعم الفني",
    enabled: true,
    type: "transfer" as const,
  },
];

const typeConfig = {
  keyword: { label: "كلمة مفتاحية", icon: MessageCircle, color: "bg-primary/10 text-primary" },
  schedule: { label: "جدول زمني", icon: Clock, color: "bg-info/10 text-info" },
  api: { label: "استدعاء API", icon: Zap, color: "bg-warning/10 text-warning" },
  transfer: { label: "تحويل", icon: ArrowLeftRight, color: "bg-kpi-3/10 text-kpi-3" },
};

const AutomationPage = () => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الأتمتة</h1>
          <p className="text-sm text-muted-foreground mt-1">إعداد قواعد الرد التلقائي وسير العمل</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          قاعدة جديدة
        </Button>
      </div>

      <div className="space-y-3">
        {automationRules.map((rule) => {
          const config = typeConfig[rule.type];
          return (
            <div key={rule.id} className="bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow animate-fade-in">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", config.color)}>
                    <config.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm">{rule.name}</h3>
                      <Badge variant="secondary" className={cn("text-[10px] border-0", config.color)}>
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      <span className="font-medium">المُحفّز:</span> {rule.trigger}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">الإجراء:</span> {rule.action}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch checked={rule.enabled} />
                  <button className="p-1.5 rounded hover:bg-secondary transition-colors">
                    <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Flows section */}
      <div className="bg-card rounded-lg p-6 shadow-card border-2 border-dashed border-border text-center">
        <Bot className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <h3 className="font-semibold text-sm mb-1">سير العمل (Flows)</h3>
        <p className="text-xs text-muted-foreground mb-4">أنشئ تدفقات محادثة تفاعلية متعددة الخطوات</p>
        <Button variant="outline" className="gap-2">
          <Plus className="w-4 h-4" />
          إنشاء Flow جديد
        </Button>
      </div>
    </div>
  );
};

export default AutomationPage;
