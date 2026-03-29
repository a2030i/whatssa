import { useState } from "react";
import { ArrowRight, Copy, Code2, Send, Users, ShoppingCart, MessageSquare, ShoppingBag, Key } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  permission: string;
  body?: Record<string, string>;
  query?: Record<string, string>;
  response?: string;
}

const endpoints: { category: string; icon: React.ElementType; items: Endpoint[] }[] = [
  {
    category: "الرسائل",
    icon: Send,
    items: [
      {
        method: "POST", path: "/messages/send", description: "إرسال رسالة نصية أو قالب عبر واتساب", permission: "messages",
        body: {
          to: "رقم الهاتف بالصيغة الدولية (مثال: 966501234567)",
          message: "نص الرسالة (مطلوب إذا لم يُرسل قالب)",
          template_name: "اسم القالب (اختياري)",
          template_language: "لغة القالب، افتراضي: ar (اختياري)",
          template_variables: "متغيرات القالب كمصفوفة (اختياري)",
        },
        response: `{ "success": true, "message_id": "wamid.xxx" }`,
      },
    ],
  },
  {
    category: "العملاء",
    icon: Users,
    items: [
      {
        method: "GET", path: "/customers", description: "جلب قائمة العملاء مع بحث وصفحات", permission: "customers",
        query: { limit: "عدد النتائج (افتراضي: 50)", offset: "بداية النتائج (افتراضي: 0)", search: "بحث بالاسم أو الهاتف أو الإيميل" },
        response: `{ "data": [...], "total": 150, "limit": 50, "offset": 0 }`,
      },
      {
        method: "POST", path: "/customers", description: "إضافة عميل جديد", permission: "customers",
        body: { phone: "رقم الهاتف (مطلوب)", name: "اسم العميل", email: "البريد الإلكتروني", tags: "مصفوفة تصنيفات", notes: "ملاحظات" },
        response: `{ "data": { "id": "uuid", "phone": "...", ... } }`,
      },
      {
        method: "PUT", path: "/customers/:id", description: "تحديث بيانات عميل", permission: "customers",
        body: { name: "الاسم الجديد", email: "الإيميل الجديد", tags: "تصنيفات جديدة" },
        response: `{ "data": { "id": "uuid", ... } }`,
      },
      {
        method: "DELETE", path: "/customers/:id", description: "حذف عميل", permission: "customers",
        response: `{ "success": true }`,
      },
    ],
  },
  {
    category: "الطلبات",
    icon: ShoppingCart,
    items: [
      {
        method: "GET", path: "/orders", description: "جلب قائمة الطلبات", permission: "orders",
        query: { limit: "عدد النتائج", offset: "بداية النتائج", status: "فلترة حسب الحالة" },
        response: `{ "data": [...], "total": 80, "limit": 50, "offset": 0 }`,
      },
      {
        method: "POST", path: "/orders", description: "إنشاء طلب جديد", permission: "orders",
        body: {
          customer_name: "اسم العميل", customer_phone: "رقم الهاتف", status: "الحالة (pending, processing, shipped, delivered)",
          total: "المبلغ الإجمالي", items: "مصفوفة المنتجات [{product_name, quantity, unit_price, total_price}]",
        },
        response: `{ "data": { "id": "uuid", ... } }`,
      },
      {
        method: "PUT", path: "/orders/:id", description: "تحديث حالة طلب", permission: "orders",
        body: { status: "الحالة الجديدة", payment_status: "حالة الدفع" },
      },
    ],
  },
  {
    category: "السلات المتروكة",
    icon: ShoppingBag,
    items: [
      {
        method: "GET", path: "/abandoned-carts", description: "جلب السلات المتروكة", permission: "orders",
        query: { limit: "عدد النتائج", offset: "بداية النتائج" },
      },
      {
        method: "POST", path: "/abandoned-carts", description: "إضافة سلة متروكة", permission: "orders",
        body: { customer_name: "الاسم", customer_phone: "الهاتف", total: "المبلغ", items: "المنتجات", checkout_url: "رابط الشراء" },
      },
    ],
  },
  {
    category: "المحادثات",
    icon: MessageSquare,
    items: [
      {
        method: "GET", path: "/conversations", description: "جلب قائمة المحادثات", permission: "conversations",
        query: { limit: "عدد النتائج", offset: "بداية النتائج", status: "فلترة حسب الحالة (active, waiting, closed)" },
        response: `{ "data": [...], "total": 200, "limit": 50, "offset": 0 }`,
      },
      {
        method: "GET", path: "/conversations/:id/messages", description: "جلب رسائل محادثة معينة", permission: "conversations",
        query: { limit: "عدد الرسائل (افتراضي: 50)" },
        response: `{ "data": [{ "id": "...", "content": "...", "sender": "customer", ... }] }`,
      },
    ],
  },
];

const methodColors: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  POST: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  PUT: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  DELETE: "bg-red-500/10 text-red-600 border-red-500/30",
};

const ApiDocsPage = () => {
  const navigate = useNavigate();
  const [openCategory, setOpenCategory] = useState<string | null>("الرسائل");

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("تم نسخ الكود");
  };

  const curlExample = (ep: Endpoint) => {
    const method = ep.method === "GET" ? "" : ` -X ${ep.method}`;
    const headers = `-H "x-api-key: YOUR_API_TOKEN" -H "Content-Type: application/json"`;
    const bodyStr = ep.body && ep.method !== "GET"
      ? ` -d '${JSON.stringify(Object.fromEntries(Object.keys(ep.body).map(k => [k, k === "to" ? "966501234567" : k === "message" ? "مرحباً" : "..."])), null, 0)}'`
      : "";
    return `curl${method} "${baseUrl}${ep.path}" \\\n  ${headers}${bodyStr}`;
  };

  const jsExample = (ep: Endpoint) => {
    if (ep.method === "GET") {
      return `const response = await fetch("${baseUrl}${ep.path}", {
  headers: { "x-api-key": "YOUR_API_TOKEN" }
});
const data = await response.json();
console.log(data);`;
    }
    const bodyObj = ep.body
      ? Object.fromEntries(Object.keys(ep.body).map(k => [k, k === "to" ? "966501234567" : k === "message" ? "مرحباً" : "..."]))
      : {};
    return `const response = await fetch("${baseUrl}${ep.path}", {
  method: "${ep.method}",
  headers: {
    "x-api-key": "YOUR_API_TOKEN",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${JSON.stringify(bodyObj, null, 2)})
});
const data = await response.json();
console.log(data);`;
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b bg-card px-4 md:px-8 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/settings")} className="p-2 rounded-lg hover:bg-secondary">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              توثيق API
            </h1>
            <p className="text-sm text-muted-foreground">دليل شامل لجميع نقاط النهاية المتاحة</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Auth Section */}
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            المصادقة (Authentication)
          </h2>
          <p className="text-sm text-muted-foreground">
            جميع الطلبات تتطلب إرسال التوكن في الهيدر <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono" dir="ltr">x-api-key</code>
          </p>
          <div className="bg-secondary rounded-lg p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap" dir="ltr">{`curl "${baseUrl}/customers" \\
  -H "x-api-key: YOUR_API_TOKEN"`}</pre>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">رابط API الأساسي:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono bg-background px-2 py-1 rounded flex-1 truncate" dir="ltr">{baseUrl}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyCode(baseUrl)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Error Codes */}
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="text-lg font-bold">رموز الاستجابة</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {[
              { code: "200", desc: "نجاح", color: "text-emerald-600" },
              { code: "201", desc: "تم الإنشاء", color: "text-emerald-600" },
              { code: "400", desc: "طلب خاطئ", color: "text-amber-600" },
              { code: "401", desc: "غير مصرح", color: "text-red-600" },
              { code: "403", desc: "ممنوع", color: "text-red-600" },
              { code: "404", desc: "غير موجود", color: "text-muted-foreground" },
              { code: "500", desc: "خطأ داخلي", color: "text-red-600" },
            ].map((c) => (
              <div key={c.code} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                <span className={cn("font-mono font-bold text-xs", c.color)}>{c.code}</span>
                <span className="text-muted-foreground text-xs">{c.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Endpoints */}
        {endpoints.map((cat) => (
          <div key={cat.category} className="bg-card border rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenCategory(openCategory === cat.category ? null : cat.category)}
              className="w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <cat.icon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">{cat.category}</h2>
                <Badge variant="outline" className="text-[10px]">{cat.items.length} endpoint</Badge>
              </div>
              <ArrowRight className={cn("w-4 h-4 transition-transform", openCategory === cat.category && "-rotate-90")} />
            </button>

            {openCategory === cat.category && (
              <div className="border-t divide-y">
                {cat.items.map((ep, i) => (
                  <div key={i} className="p-5 space-y-4">
                    {/* Method + Path */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className={cn("font-mono text-xs px-2", methodColors[ep.method])}>
                        {ep.method}
                      </Badge>
                      <code className="text-sm font-mono font-medium" dir="ltr">{ep.path}</code>
                      <Badge variant="outline" className="text-[10px]">{ep.permission}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{ep.description}</p>

                    {/* Query Params */}
                    {ep.query && (
                      <div>
                        <p className="text-xs font-semibold mb-1.5">Query Parameters:</p>
                        <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                          {Object.entries(ep.query).map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-xs">
                              <code className="font-mono text-primary min-w-[80px]" dir="ltr">{k}</code>
                              <span className="text-muted-foreground">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Body Params */}
                    {ep.body && (
                      <div>
                        <p className="text-xs font-semibold mb-1.5">Body (JSON):</p>
                        <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                          {Object.entries(ep.body).map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-xs">
                              <code className="font-mono text-primary min-w-[120px]" dir="ltr">{k}</code>
                              <span className="text-muted-foreground">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Response */}
                    {ep.response && (
                      <div>
                        <p className="text-xs font-semibold mb-1.5">الاستجابة:</p>
                        <div className="bg-secondary rounded-lg p-3 relative">
                          <pre className="text-xs font-mono whitespace-pre-wrap" dir="ltr">{ep.response}</pre>
                        </div>
                      </div>
                    )}

                    {/* Code Examples */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold">أمثلة:</p>
                      <div className="bg-secondary rounded-lg p-3 relative">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-[10px]">cURL</Badge>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(curlExample(ep))}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto" dir="ltr">{curlExample(ep)}</pre>
                      </div>
                      <div className="bg-secondary rounded-lg p-3 relative">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-[10px]">JavaScript</Badge>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(jsExample(ep))}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto" dir="ltr">{jsExample(ep)}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApiDocsPage;
