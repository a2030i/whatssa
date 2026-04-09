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
  { value: "medium", label: "متوسطة", color: "bg-warning/10 text-warning" },
  { value: "high", label: "عالية", color: "bg-destructive/10 text-destructive" },
  { value: "urgent", label: "عاجلة", color: "bg-destructive text-destructive-foreground" },
];

export const TICKET_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "مفتوحة", color: "bg-primary/10 text-primary" },
  in_progress: { label: "قيد المعالجة", color: "bg-warning/10 text-warning" },
  waiting: { label: "بانتظار الرد", color: "bg-muted text-muted-foreground" },
  resolved: { label: "تم الحل", color: "bg-success/10 text-success" },
  closed: { label: "مغلقة", color: "bg-muted text-muted-foreground" },
};
