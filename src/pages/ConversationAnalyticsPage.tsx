import { useState, useEffect } from "react";
import { Loader2, RefreshCw, TrendingUp, MessageSquare, DollarSign, Globe, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invokeCloud } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ConversationDataPoint {
  start: number;
  end: number;
  conversation: number;
  phone_number?: string;
  country?: string;
  conversation_type?: string;
  conversation_category?: string;
  cost?: number;
}

const categoryLabels: Record<string, string> = {
  marketing: "تسويقي",
  utility: "خدمي",
  authentication: "مصادقة",
  service: "خدمة عملاء",
  referral_conversion: "إحالة",
};

const typeLabels: Record<string, string> = {
  FREE_ENTRY: "مجاني (دخول)",
  FREE_TIER: "مجاني (طبقة)",
  REGULAR: "مدفوع",
};

const categoryColors: Record<string, string> = {
  marketing: "bg-primary/10 text-primary",
  utility: "bg-info/10 text-info",
  authentication: "bg-warning/10 text-warning",
  service: "bg-success/10 text-success",
  referral_conversion: "bg-accent/10 text-accent-foreground",
};

// Saudi Arabia pricing (approximate)
const pricingPerConversation: Record<string, number> = {
  marketing: 0.0583,
  utility: 0.0250,
  authentication: 0.0340,
  service: 0.0000,
};

const ConversationAnalyticsPage = () => {
  const [analytics, setAnalytics] = useState<ConversationDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  const loadAnalytics = async () => {
    setIsLoading(true);
    const days = parseInt(period);
    const startTs = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const endTs = Math.floor(Date.now() / 1000);

    const { data, error } = await invokeCloud("whatsapp-catalog", {
      body: {
        action: "conversation_analytics",
        start: startTs,
        end: endTs,
        granularity: days <= 7 ? "DAILY" : "DAILY",
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || "تعذر جلب تحليلات المحادثات");
      setAnalytics([]);
    } else {
      setAnalytics(data?.analytics || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  // Aggregate by category
  const categoryTotals: Record<string, { count: number; cost: number }> = {};
  const typeTotals: Record<string, number> = {};
  const countryTotals: Record<string, number> = {};
  let totalConversations = 0;
  let totalEstimatedCost = 0;

  analytics.forEach((dp: any) => {
    const dataPoints = dp.data_points || [dp];
    dataPoints.forEach((point: any) => {
      const count = point.conversation || 1;
      const cat = point.conversation_category || "service";
      const type = point.conversation_type || "REGULAR";
      const country = point.country || "SA";

      totalConversations += count;

      if (!categoryTotals[cat]) categoryTotals[cat] = { count: 0, cost: 0 };
      categoryTotals[cat].count += count;
      const costPerConv = pricingPerConversation[cat] || 0;
      categoryTotals[cat].cost += count * costPerConv;
      totalEstimatedCost += count * costPerConv;

      typeTotals[type] = (typeTotals[type] || 0) + count;
      countryTotals[country] = (countryTotals[country] || 0) + count;
    });
  });

  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1].count - a[1].count);
  const sortedCountries = Object.entries(countryTotals).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="p-3 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">تحليلات المحادثات والتكاليف</h1>
          <p className="text-sm text-muted-foreground mt-1">تتبع محادثات ميتا وتقدير التكاليف حسب الفئة</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="14">آخر 14 يوم</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
              <SelectItem value="90">آخر 90 يوم</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2" onClick={loadAnalytics} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            تحديث
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : analytics.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-base font-semibold">لا توجد بيانات</h3>
          <p className="text-sm text-muted-foreground mt-1">لم يتم العثور على محادثات في الفترة المحددة</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-primary" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{totalConversations.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">إجمالي المحادثات</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-success" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">${totalEstimatedCost.toFixed(2)}</p>
              <p className="text-[11px] text-muted-foreground">التكلفة التقديرية (USD)</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-warning" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">
                ~{totalEstimatedCost > 0 ? (totalEstimatedCost * 3.75).toFixed(0) : "0"} <span className="text-sm font-normal">ر.س</span>
              </p>
              <p className="text-[11px] text-muted-foreground">التكلفة بالريال (تقريبي)</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-info" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{Object.keys(countryTotals).length}</p>
              <p className="text-[11px] text-muted-foreground">عدد الدول</p>
            </div>
          </div>

          {/* Categories breakdown */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <h3 className="text-sm font-bold">التوزيع حسب الفئة</h3>
              {sortedCategories.map(([cat, data]) => {
                const pct = totalConversations > 0 ? Math.round((data.count / totalConversations) * 100) : 0;
                return (
                  <div key={cat} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-[10px] border-0", categoryColors[cat] || "bg-muted text-muted-foreground")}>
                          {categoryLabels[cat] || cat}
                        </Badge>
                        <span className="text-xs text-foreground font-semibold">{data.count.toLocaleString()}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">${data.cost.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className={cn("h-1.5 rounded-full", cat === "marketing" ? "bg-primary" : cat === "utility" ? "bg-info" : cat === "authentication" ? "bg-warning" : "bg-success")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {sortedCategories.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">لا توجد بيانات</p>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <h3 className="text-sm font-bold">نوع المحادثة</h3>
              {Object.entries(typeTotals).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                const pct = totalConversations > 0 ? Math.round((count / totalConversations) * 100) : 0;
                return (
                  <div key={type} className="flex items-center justify-between bg-muted/30 rounded-lg p-2.5">
                    <div>
                      <p className="text-xs font-semibold">{typeLabels[type] || type}</p>
                      <p className="text-[10px] text-muted-foreground">{pct}% من الإجمالي</p>
                    </div>
                    <p className="text-sm font-bold">{count.toLocaleString()}</p>
                  </div>
                );
              })}

              <div className="pt-2 border-t border-border">
                <h4 className="text-xs font-bold mb-2">أعلى الدول</h4>
                {sortedCountries.map(([country, count]) => (
                  <div key={country} className="flex items-center justify-between py-1">
                    <span className="text-[11px] text-muted-foreground">{country}</span>
                    <span className="text-xs font-semibold">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pricing reference */}
          <div className="bg-muted/30 rounded-xl border border-border p-4">
            <h3 className="text-sm font-bold mb-3">💡 أسعار ميتا المرجعية (السعودية)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(pricingPerConversation).map(([cat, price]) => (
                <div key={cat} className="bg-card rounded-lg p-3 text-center">
                  <Badge className={cn("text-[9px] border-0 mb-1", categoryColors[cat] || "bg-muted text-muted-foreground")}>
                    {categoryLabels[cat] || cat}
                  </Badge>
                  <p className="text-lg font-bold text-foreground">${price.toFixed(4)}</p>
                  <p className="text-[9px] text-muted-foreground">~{(price * 3.75).toFixed(2)} ر.س / محادثة</p>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground mt-2 text-center">
              * الأسعار تقديرية وتعتمد على التسعير الرسمي لـ Meta. محادثات خدمة العملاء (أول 1000 شهرياً) مجانية.
              <a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noreferrer" className="text-primary hover:underline mr-1">المصدر الرسمي</a>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default ConversationAnalyticsPage;

