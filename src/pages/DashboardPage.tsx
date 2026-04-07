import { useState, useEffect, useCallback } from "react";
import { useDashboardData } from "@/hooks/useDashboardData";
import StatusBar from "@/components/dashboard/StatusBar";
import SmartAlerts from "@/components/dashboard/SmartAlerts";
import OperationalMetrics from "@/components/dashboard/OperationalMetrics";
import AccountHealth from "@/components/dashboard/AccountHealth";
import SmartInsight from "@/components/dashboard/SmartInsight";
import VerificationCard from "@/components/dashboard/VerificationCard";
import TokenAlert from "@/components/dashboard/TokenAlert";
import WhatsAppSafetyBanner from "@/components/dashboard/WhatsAppSafetyBanner";
import LiveMonitorWidget from "@/components/dashboard/LiveMonitorWidget";
import { Loader2, LayoutDashboard, Settings2, GripVertical, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

interface WidgetConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "safety_banner", label: "تنبيهات السلامة", visible: true, order: 0 },
  { id: "live_monitor", label: "المراقبة الحية", visible: true, order: 1 },
  { id: "status_bar", label: "شريط الحالة", visible: true, order: 2 },
  { id: "token_alert", label: "تنبيه التوكن", visible: true, order: 3 },
  { id: "verification", label: "حالة التحقق", visible: true, order: 4 },
  { id: "smart_alerts", label: "التنبيهات الذكية", visible: true, order: 5 },
  { id: "smart_insight", label: "رؤى ذكية", visible: true, order: 6 },
  { id: "operational", label: "المقاييس التشغيلية", visible: true, order: 7 },
  { id: "account_health", label: "صحة الحساب", visible: true, order: 8 },
];

const STORAGE_KEY = "dashboard_widget_config";

const DashboardPage = () => {
  const data = useDashboardData();
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_WIDGETS;
  });
  const [editMode, setEditMode] = useState(false);
  const [dragItem, setDragItem] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const toggleVisibility = (id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const resetLayout = () => {
    setWidgets(DEFAULT_WIDGETS);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleDragStart = (index: number) => setDragItem(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragItem === null || dragItem === index) return;

    const newWidgets = [...widgets];
    const [dragged] = newWidgets.splice(dragItem, 1);
    newWidgets.splice(index, 0, dragged);
    // Update order
    newWidgets.forEach((w, i) => w.order = i);
    setWidgets(newWidgets);
    setDragItem(index);
  };

  const handleDragEnd = () => setDragItem(null);

  const renderWidget = (widget: WidgetConfig) => {
    if (!widget.visible) return null;

    const wrapper = (children: React.ReactNode) => (
      <div
        key={widget.id}
        className={cn("relative group", editMode && "ring-1 ring-dashed ring-border/50 rounded-xl p-1")}
        draggable={editMode}
        onDragStart={() => handleDragStart(widgets.indexOf(widget))}
        onDragOver={(e) => handleDragOver(e, widgets.indexOf(widget))}
        onDragEnd={handleDragEnd}
      >
        {editMode && (
          <div className="absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing bg-card/90 backdrop-blur-sm rounded-lg p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        {children}
      </div>
    );

    switch (widget.id) {
      case "safety_banner": return wrapper(<WhatsAppSafetyBanner />);
      case "live_monitor": return wrapper(<LiveMonitorWidget />);
      case "status_bar": return wrapper(<StatusBar data={data} />);
      case "token_alert": return wrapper(<TokenAlert data={data} />);
      case "verification": return wrapper(<VerificationCard data={data} />);
      case "smart_alerts": return wrapper(<SmartAlerts data={data} />);
      case "smart_insight": return wrapper(<SmartInsight data={data} />);
      case "operational": return wrapper(<OperationalMetrics data={data} />);
      case "account_health": return wrapper(<AccountHealth data={data} />);
      default: return null;
    }
  };

  if (data.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">جاري التحميل...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
            <LayoutDashboard className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">لوحة التحكم</h1>
            <p className="text-sm text-muted-foreground">
              {data.orgName && `${data.orgName} • `}
              <span className="font-semibold">{data.planName}</span>
              {" • "}
              <span className={data.subscriptionStatus === "trial" ? "text-warning font-semibold" : "text-success font-semibold"}>
                {data.subscriptionStatus === "trial" ? "فترة تجريبية" : data.subscriptionStatus === "active" ? "فعّال" : data.subscriptionStatus}
              </span>
            </p>
          </div>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1.5 rounded-xl">
              <Settings2 className="w-3.5 h-3.5" /> تخصيص
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80" dir="rtl">
            <SheetHeader>
              <SheetTitle className="text-base">تخصيص لوحة التحكم</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-1">
              <p className="text-xs text-muted-foreground mb-3">أخفِ أو أظهر الويدجتات واسحبها لإعادة ترتيبها</p>

              {widgets.map((w) => (
                <div key={w.id} className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-2">
                    {w.visible ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className={cn("text-sm", !w.visible && "text-muted-foreground")}>{w.label}</span>
                  </div>
                  <Switch checked={w.visible} onCheckedChange={() => toggleVisibility(w.id)} />
                </div>
              ))}

              <div className="pt-4 border-t border-border/40 flex gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1.5 flex-1" onClick={resetLayout}>
                  <RotateCcw className="w-3 h-3" /> استعادة الافتراضي
                </Button>
                <Button variant={editMode ? "default" : "outline"} size="sm" className="text-xs gap-1.5 flex-1" onClick={() => setEditMode(!editMode)}>
                  <GripVertical className="w-3 h-3" /> {editMode ? "إنهاء الترتيب" : "ترتيب"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Widgets */}
      {widgets.map(renderWidget)}
    </div>
  );
};

export default DashboardPage;
