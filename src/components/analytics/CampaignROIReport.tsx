import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, TrendingUp, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface CampaignROI {
  id: string;
  name: string;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  estimatedCost: number;
  deliveryRate: number;
  readRate: number;
  costPerDelivered: number;
  costPerRead: number;
}

// Meta pricing for Saudi Arabia (approximate SAR)
const META_MARKETING_COST = 0.35;
const META_UTILITY_COST = 0.15;

const CampaignROIReport = () => {
  const { orgId } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignROI[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCost, setTotalCost] = useState(0);
  const [totalDelivered, setTotalDelivered] = useState(0);
  const [totalRead, setTotalRead] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    fetchROI();
  }, [orgId]);

  const fetchROI = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("id, name, sent_count, delivered_count, read_count, failed_count, template_name, status")
      .eq("org_id", orgId)
      .in("status", ["sent", "sending"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      let tCost = 0, tDel = 0, tRead = 0;
      const mapped = data.map((c) => {
        const sent = c.sent_count || 0;
        const delivered = c.delivered_count || 0;
        const read = c.read_count || 0;
        const failed = c.failed_count || 0;
        const cost = sent * META_MARKETING_COST;
        const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
        const readRate = delivered > 0 ? Math.round((read / delivered) * 100) : 0;
        const costPerDelivered = delivered > 0 ? Math.round((cost / delivered) * 100) / 100 : 0;
        const costPerRead = read > 0 ? Math.round((cost / read) * 100) / 100 : 0;

        tCost += cost;
        tDel += delivered;
        tRead += read;

        return {
          id: c.id,
          name: c.name,
          sentCount: sent,
          deliveredCount: delivered,
          readCount: read,
          failedCount: failed,
          estimatedCost: Math.round(cost * 100) / 100,
          deliveryRate,
          readRate,
          costPerDelivered,
          costPerRead,
        };
      });
      setCampaigns(mapped);
      setTotalCost(Math.round(tCost * 100) / 100);
      setTotalDelivered(tDel);
      setTotalRead(tRead);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const chartData = campaigns.slice(0, 10).map((c) => ({
    name: c.name.length > 15 ? c.name.slice(0, 15) + "…" : c.name,
    "التكلفة (ر.س)": c.estimatedCost,
    "تم التوصيل": c.deliveredCount,
    "تمت القراءة": c.readCount,
  }));

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي التكلفة المقدّرة", value: `${totalCost} ر.س`, icon: DollarSign, color: "text-warning" },
          { label: "تم التوصيل", value: totalDelivered, icon: TrendingUp, color: "text-primary" },
          { label: "تمت القراءة", value: totalRead, icon: TrendingUp, color: "text-success" },
          { label: "تكلفة/قراءة", value: totalRead > 0 ? `${(totalCost / totalRead).toFixed(2)} ر.س` : "—", icon: DollarSign, color: "text-info" },
        ].map((s) => (
          <Card key={s.label} className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
            <CardContent className="p-3 text-center">
              <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.color)} />
              <p className={cn("text-lg font-black", s.color)}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">أداء الحملات (آخر 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={50} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="تم التوصيل" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="تمت القراءة" fill="hsl(142 64% 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {campaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">تفاصيل ROI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right p-2 font-semibold text-muted-foreground">الحملة</th>
                    <th className="text-right p-2 font-semibold text-muted-foreground">أُرسلت</th>
                    <th className="text-right p-2 font-semibold text-muted-foreground">وصلت</th>
                    <th className="text-right p-2 font-semibold text-muted-foreground">قُرئت</th>
                    <th className="text-right p-2 font-semibold text-muted-foreground">التكلفة</th>
                    <th className="text-right p-2 font-semibold text-muted-foreground">تكلفة/توصيل</th>
                    <th className="text-right p-2 font-semibold text-muted-foreground">% توصيل</th>
                    <th className="text-right p-2 font-semibold text-muted-foreground">% قراءة</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                      <td className="p-2 font-medium max-w-[120px] truncate">{c.name}</td>
                      <td className="p-2">{c.sentCount}</td>
                      <td className="p-2 text-primary font-semibold">{c.deliveredCount}</td>
                      <td className="p-2 text-success font-semibold">{c.readCount}</td>
                      <td className="p-2">{c.estimatedCost} ر.س</td>
                      <td className="p-2">{c.costPerDelivered} ر.س</td>
                      <td className="p-2">{c.deliveryRate}%</td>
                      <td className="p-2">{c.readRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              * التكلفة مقدّرة بناءً على أسعار Meta للسعودية (تسويقي: {META_MARKETING_COST} ر.س/رسالة)
            </p>
          </CardContent>
        </Card>
      )}

      {campaigns.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-sm text-muted-foreground">لا توجد حملات مرسلة بعد</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CampaignROIReport;
