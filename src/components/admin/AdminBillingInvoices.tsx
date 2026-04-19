import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { FileText, Search, Download, Building2, DollarSign, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Invoice {
  id: string;
  invoice_number: string | null;
  org_id: string;
  org_name: string | null;
  status: string;
  total_amount: number | null;
  currency: string | null;
  billing_cycle: string | null;
  billing_name: string | null;
  paid_at: string | null;
  due_date: string | null;
  created_at: string | null;
  pdf_url: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  paid:     { label: "مدفوع",    color: "bg-green-100 text-green-700" },
  pending:  { label: "معلق",     color: "bg-amber-100 text-amber-700" },
  overdue:  { label: "متأخر",    color: "bg-red-100 text-red-700" },
  cancelled:{ label: "ملغي",     color: "bg-gray-100 text-gray-500" },
  refunded: { label: "مُسترد",   color: "bg-blue-100 text-blue-700" },
};

const fetchInvoices = async (search: string): Promise<Invoice[]> => {
  const { data, error } = await supabase
    .from("billing_invoices")
    .select("id, invoice_number, org_id, status, total_amount, currency, billing_cycle, billing_name, paid_at, due_date, created_at, pdf_url, organizations!inner(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || [])
    .map((r: any) => ({ ...r, org_name: r.organizations?.name || null }))
    .filter(r => !search || r.org_name?.includes(search) || r.invoice_number?.includes(search) || r.billing_name?.includes(search));
};

const fmt = (n: number | null, cur: string | null) =>
  n != null ? `${n.toLocaleString()} ${cur || "SAR"}` : "—";

const AdminBillingInvoices = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    debounceRef[1](setTimeout(() => setDebouncedSearch(val), 400));
  };

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["admin-billing-invoices", debouncedSearch],
    queryFn: () => fetchInvoices(debouncedSearch),
    staleTime: 2 * 60_000,
  });

  const filtered = statusFilter === "all" ? invoices : invoices.filter(i => i.status === statusFilter);

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total_amount || 0), 0);
  const pendingCount = invoices.filter(i => i.status === "pending").length;
  const overdueCount = invoices.filter(i => i.status === "overdue").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            فواتير المنظمات
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">جميع الفواتير عبر المنصة</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border rounded-2xl p-3 text-center">
          <DollarSign className="w-4 h-4 text-green-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-green-600">{totalRevenue.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي المدفوع</p>
        </div>
        <div className="border border-border rounded-2xl p-3 text-center">
          <TrendingUp className="w-4 h-4 text-amber-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-amber-600">{pendingCount}</p>
          <p className="text-[10px] text-muted-foreground">معلقة</p>
        </div>
        <div className="border border-border rounded-2xl p-3 text-center">
          <FileText className="w-4 h-4 text-red-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-red-600">{overdueCount}</p>
          <p className="text-[10px] text-muted-foreground">متأخرة</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "paid", "pending", "overdue", "cancelled", "refunded"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn("text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors",
              statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
            {s === "all" ? "الكل" : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="ابحث بالمنظمة أو رقم الفاتورة..." dir="rtl"
            className="w-full border border-border rounded-xl py-2 pr-8 pl-3 text-xs bg-background focus:outline-none" />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <FileText className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">لا توجد فواتير</p>
        </div>
      ) : (
        <div className="border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">المنظمة</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">رقم الفاتورة</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">المبلغ</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">الحالة</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">التاريخ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(inv => {
                const sc = STATUS_CONFIG[inv.status] || { label: inv.status, color: "bg-gray-100 text-gray-500" };
                return (
                  <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-[13px] font-medium">{inv.org_name || inv.org_id.slice(0, 8)}</p>
                          {inv.billing_name && inv.billing_name !== inv.org_name && (
                            <p className="text-[11px] text-muted-foreground">{inv.billing_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-[12px] font-mono text-muted-foreground">{inv.invoice_number || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] font-semibold">{fmt(inv.total_amount, inv.currency)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-lg", sc.color)}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-[11px] text-muted-foreground">
                        {inv.paid_at
                          ? format(new Date(inv.paid_at), "dd/MM/yyyy", { locale: ar })
                          : inv.created_at
                            ? format(new Date(inv.created_at), "dd/MM/yyyy", { locale: ar })
                            : "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {inv.pdf_url && (
                        <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                          <Download className="w-3 h-3" /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminBillingInvoices;
