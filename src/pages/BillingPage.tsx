import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Receipt, CheckCircle2, XCircle, Clock, CreditCard, Download, CalendarDays, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_type: string;
  billing_cycle: string | null;
  moyasar_source_type: string | null;
  created_at: string;
  paid_at: string | null;
  plan_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface Plan {
  id: string;
  name_ar: string;
  name: string;
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  paid: { label: "مدفوعة", icon: CheckCircle2, color: "text-green-500 bg-green-500/10" },
  completed: { label: "مكتملة", icon: CheckCircle2, color: "text-green-500 bg-green-500/10" },
  pending: { label: "معلّقة", icon: Clock, color: "text-yellow-500 bg-yellow-500/10" },
  failed: { label: "فاشلة", icon: XCircle, color: "text-destructive bg-destructive/10" },
  refunded: { label: "مستردة", icon: XCircle, color: "text-muted-foreground bg-muted" },
};

const paymentTypeLabels: Record<string, string> = {
  subscription: "اشتراك باقة",
  addon_qr: "إضافة أرقام QR",
  wallet_topup: "شحن محفظة",
};

const sourceLabels: Record<string, string> = {
  creditcard: "بطاقة ائتمان",
  applepay: "Apple Pay",
  stcpay: "STC Pay",
};

const BillingPage = () => {
  const { orgId } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (orgId) loadData();
  }, [orgId]);

  const loadData = async () => {
    setLoading(true);
    const [paymentsRes, plansRes] = await Promise.all([
      supabase
        .from("payments")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false }),
      supabase.from("plans").select("id, name_ar, name").eq("is_active", true),
    ]);
    setPayments((paymentsRes.data as Payment[]) || []);
    setPlans((plansRes.data as Plan[]) || []);
    setLoading(false);
  };

  const getPlanName = (planId: string | null) => {
    if (!planId) return "—";
    const plan = plans.find((p) => p.id === planId);
    return plan?.name_ar || plan?.name || "—";
  };

  const filtered = statusFilter === "all" ? payments : payments.filter((p) => p.status === statusFilter);

  const totalPaid = payments
    .filter((p) => p.status === "paid" || p.status === "completed")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[900px]" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          سجل المدفوعات والفواتير
        </h1>
        <p className="text-sm text-muted-foreground mt-1">جميع عمليات الدفع والاشتراكات الخاصة بمؤسستك</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card rounded-xl shadow-card p-4">
          <p className="text-xs text-muted-foreground">إجمالي المدفوعات</p>
          <p className="text-xl font-bold text-primary mt-1">{totalPaid.toFixed(2)} <span className="text-xs">ر.س</span></p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4">
          <p className="text-xs text-muted-foreground">عدد العمليات</p>
          <p className="text-xl font-bold mt-1">{payments.length}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-muted-foreground">آخر دفعة</p>
          <p className="text-sm font-semibold mt-1">
            {payments.length > 0
              ? new Date(payments[0].created_at).toLocaleDateString("ar-SA", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "لا توجد"}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <SelectValue placeholder="تصفية حسب الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="paid">مدفوعة</SelectItem>
            <SelectItem value="pending">معلّقة</SelectItem>
            <SelectItem value="failed">فاشلة</SelectItem>
            <SelectItem value="refunded">مستردة</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground mr-auto">{filtered.length} عملية</span>
      </div>

      {/* Payments List */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد مدفوعات بعد</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((payment) => {
              const config = statusConfig[payment.status] || statusConfig.pending;
              const StatusIcon = config.icon;
              return (
                <div key={payment.id} className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                  {/* Status Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}>
                    <StatusIcon className="w-4 h-4" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">
                        {paymentTypeLabels[payment.payment_type] || payment.payment_type}
                      </p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {config.label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                      {payment.plan_id && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          {getPlanName(payment.plan_id)}
                        </span>
                      )}
                      {payment.billing_cycle && (
                        <span>{payment.billing_cycle === "yearly" ? "سنوي" : "شهري"}</span>
                      )}
                      {payment.moyasar_source_type && (
                        <span>{sourceLabels[payment.moyasar_source_type] || payment.moyasar_source_type}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(payment.created_at).toLocaleDateString("ar-SA", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-left shrink-0">
                    <p className="text-sm font-bold">
                      {Number(payment.amount).toFixed(2)} <span className="text-[10px] text-muted-foreground">ر.س</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingPage;
