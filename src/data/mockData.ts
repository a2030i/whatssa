export interface Conversation {
  id: string;
  customerName: string;
  customerPhone: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  assignedTo: string;
  status: "active" | "waiting" | "closed";
  tags: string[];
  email?: string;
  notes?: string;
  lastSeen?: string;
  lastCustomerMessageAt?: string;
  conversationType?: "private" | "group" | "broadcast";
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: "marketing" | "utility" | "authentication";
  language: string;
  status: "approved" | "pending" | "rejected";
  header?: string;
  body: string;
  footer?: string;
  buttons?: { type: "url" | "phone" | "quick_reply"; text: string; value?: string }[];
  variables?: string[];
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  text: string;
  sender: "customer" | "agent" | "system";
  timestamp: string;
  status?: "sent" | "delivered" | "read";
  type?: "text" | "image" | "document" | "note" | "template" | "audio" | "video";
  mediaUrl?: string;
  senderName?: string;
  quoted?: {
    stanza_id?: string;
    message_id?: string;
    sender_name?: string;
    text?: string;
  };
}

export interface Agent {
  id: string;
  name: string;
  initials: string;
  activeChats: number;
  avgResponseTime: string;
  resolved: number;
  satisfaction: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "sent" | "failed";
  audience: number;
  sent: number;
  delivered: number;
  failed: number;
  scheduledAt?: string;
  sentAt?: string;
}

export const quickReplies = [
  { id: "1", label: "ترحيب", text: "أهلاً وسهلاً! كيف أقدر أساعدك اليوم؟" },
  { id: "2", label: "انتظار", text: "لحظة من فضلك، جاري التحقق من طلبك..." },
  { id: "3", label: "شكراً", text: "شكراً لتواصلك معنا! سعدنا بخدمتك 😊" },
  { id: "4", label: "توصيل", text: "سيتم توصيل طلبك خلال 2-3 أيام عمل." },
  { id: "5", label: "إرجاع", text: "يمكنك إرجاع المنتج خلال 14 يوم من تاريخ الاستلام." },
  { id: "6", label: "دفع", text: "طرق الدفع المتاحة: تحويل بنكي، بطاقة ائتمان، Apple Pay." },
];

export const messageTemplates: MessageTemplate[] = [
  {
    id: "t1", name: "ترحيب_عميل_جديد", category: "marketing", language: "ar", status: "approved",
    header: "مرحباً {{1}}! 👋",
    body: "أهلاً بك في {{2}}! يسعدنا انضمامك. تصفح منتجاتنا واستمتع بخصم {{3}}% على أول طلب.",
    footer: "للإلغاء أرسل STOP",
    buttons: [{ type: "url", text: "تصفح المنتجات", value: "https://example.com" }],
    variables: ["اسم العميل", "اسم المتجر", "نسبة الخصم"],
    createdAt: "2026-03-01",
  },
  {
    id: "t2", name: "تحديث_طلب", category: "utility", language: "ar", status: "approved",
    body: "مرحباً {{1}}، طلبك رقم #{{2}} تم تحديث حالته إلى: {{3}}. يمكنك تتبع طلبك من الرابط أدناه.",
    buttons: [{ type: "url", text: "تتبع الطلب", value: "https://example.com/track" }],
    variables: ["اسم العميل", "رقم الطلب", "الحالة الجديدة"],
    createdAt: "2026-03-05",
  },
  {
    id: "t3", name: "تذكير_سلة_متروكة", category: "marketing", language: "ar", status: "approved",
    header: "نسيت شيء؟ 🛒",
    body: "مرحباً {{1}}، لاحظنا أن عندك منتجات في السلة! أكمل طلبك الآن واستمتع بتوصيل مجاني.",
    buttons: [{ type: "url", text: "أكمل الطلب", value: "https://example.com/cart" }, { type: "quick_reply", text: "لا أرغب" }],
    variables: ["اسم العميل"],
    createdAt: "2026-03-10",
  },
  {
    id: "t4", name: "رمز_التحقق", category: "authentication", language: "ar", status: "approved",
    body: "رمز التحقق الخاص بك هو: {{1}}. صالح لمدة 5 دقائق. لا تشاركه مع أحد.",
    variables: ["رمز التحقق"],
    createdAt: "2026-03-12",
  },
  {
    id: "t5", name: "عرض_موسمي", category: "marketing", language: "ar", status: "pending",
    header: "🎉 عرض خاص!",
    body: "مرحباً {{1}}، خصم {{2}}% على جميع المنتجات لفترة محدودة! العرض ينتهي {{3}}.",
    footer: "الشروط والأحكام تطبق",
    buttons: [{ type: "url", text: "تسوق الآن", value: "https://example.com/sale" }],
    variables: ["اسم العميل", "نسبة الخصم", "تاريخ الانتهاء"],
    createdAt: "2026-03-20",
  },
  {
    id: "t6", name: "تقييم_الخدمة", category: "utility", language: "ar", status: "approved",
    body: "مرحباً {{1}}، نتمنى أن تكون تجربتك ممتازة! نقدر رأيك، كيف تقيم خدمتنا؟",
    buttons: [{ type: "quick_reply", text: "ممتاز ⭐⭐⭐⭐⭐" }, { type: "quick_reply", text: "جيد ⭐⭐⭐" }, { type: "quick_reply", text: "سيء ⭐" }],
    variables: ["اسم العميل"],
    createdAt: "2026-03-15",
  },
];

export const agents: Agent[] = [
  { id: "1", name: "أحمد محمد", initials: "أم", activeChats: 12, avgResponseTime: "1.2 دقيقة", resolved: 45, satisfaction: 94 },
  { id: "2", name: "فاطمة علي", initials: "فع", activeChats: 8, avgResponseTime: "2.1 دقيقة", resolved: 38, satisfaction: 97 },
  { id: "3", name: "خالد سعد", initials: "خس", activeChats: 15, avgResponseTime: "0.8 دقيقة", resolved: 52, satisfaction: 91 },
  { id: "4", name: "ريم ناصر", initials: "رن", activeChats: 6, avgResponseTime: "1.5 دقيقة", resolved: 29, satisfaction: 96 },
];

export const campaigns: Campaign[] = [
  { id: "1", name: "عروض رمضان", status: "sent", audience: 5000, sent: 4850, delivered: 4720, failed: 130, sentAt: "2026-03-15" },
  { id: "2", name: "تحديث الشروط", status: "scheduled", audience: 12000, sent: 0, delivered: 0, failed: 0, scheduledAt: "2026-03-30" },
  { id: "3", name: "عرض الجمعة البيضاء", status: "draft", audience: 8000, sent: 0, delivered: 0, failed: 0 },
  { id: "4", name: "تذكير بالسداد", status: "sent", audience: 3200, sent: 3200, delivered: 3100, failed: 100, sentAt: "2026-03-20" },
];

export const analyticsData = {
  dailyConversations: [
    { day: "السبت", count: 45 }, { day: "الأحد", count: 62 }, { day: "الاثنين", count: 78 },
    { day: "الثلاثاء", count: 55 }, { day: "الأربعاء", count: 89 }, { day: "الخميس", count: 42 },
    { day: "الجمعة", count: 30 },
  ],
  hourlyDistribution: [
    { hour: "8", count: 12 }, { hour: "9", count: 28 }, { hour: "10", count: 45 },
    { hour: "11", count: 52 }, { hour: "12", count: 38 }, { hour: "13", count: 22 },
    { hour: "14", count: 35 }, { hour: "15", count: 48 }, { hour: "16", count: 55 },
    { hour: "17", count: 42 }, { hour: "18", count: 30 }, { hour: "19", count: 18 },
  ],
  teamPerformance: [
    { name: "أحمد", conversations: 45, avgResponse: 1.2, resolved: 42 },
    { name: "فاطمة", conversations: 38, avgResponse: 2.1, resolved: 35 },
    { name: "خالد", conversations: 52, avgResponse: 0.8, resolved: 50 },
    { name: "ريم", conversations: 29, avgResponse: 1.5, resolved: 27 },
  ],
};
