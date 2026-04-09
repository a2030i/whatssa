import { AlertCircle, RefreshCw, Clock, CheckCircle2, XCircle } from "lucide-react";

export const TICKET_CATEGORIES = [
  { value: "general", label: "عام", icon: "📋" },
  { value: "complaint", label: "شكوى", icon: "⚠️" },
  { value: "inquiry", label: "استفسار", icon: "❓" },
  { value: "technical", label: "مشكلة تقنية", icon: "🔧" },
  { value: "billing", label: "فوترة / دفع", icon: "💳" },
  { value: "shipping", label: "شحن وتوصيل", icon: "🚚" },
  { value: "return", label: "استرجاع / استبدال", icon: "🔄" },
  { value: "feature_request", label: "طلب ميزة", icon: "💡" },
];

export const TICKET_PRIORITIES = [
  { value: "low", label: "منخفضة", color: "bg-muted text-muted-foreground" },
  { value: "medium", label: "متوسطة", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "high", label: "عالية", color: "bg-destructive/10 text-destructive" },
  { value: "urgent", label: "عاجلة", color: "bg-destructive text-destructive-foreground" },
];

export const TICKET_STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  open: { label: "مفتوحة", icon: AlertCircle, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  in_progress: { label: "قيد المعالجة", icon: RefreshCw, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  waiting_customer: { label: "بانتظار العميل", icon: Clock, color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  resolved: { label: "تم الحل", icon: CheckCircle2, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  closed: { label: "مغلقة", icon: XCircle, color: "bg-muted text-muted-foreground" },
};

export interface TicketRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  assigned_to: string | null;
  created_by: string | null;
  conversation_id: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  message_ids: string[];
  message_previews: any[];
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}
