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
}

export interface Message {
  id: string;
  text: string;
  sender: "customer" | "agent";
  timestamp: string;
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

export const conversations: Conversation[] = [
  { id: "1", customerName: "سارة أحمد", customerPhone: "+966501234567", lastMessage: "متى يتم توصيل الطلب؟", timestamp: "منذ 2 دقيقة", unread: 3, assignedTo: "أحمد", status: "active", tags: ["طلب", "توصيل"] },
  { id: "2", customerName: "محمد علي", customerPhone: "+966507654321", lastMessage: "شكراً لكم على الخدمة الممتازة", timestamp: "منذ 15 دقيقة", unread: 0, assignedTo: "فاطمة", status: "active", tags: ["شكوى محلولة"] },
  { id: "3", customerName: "نورة خالد", customerPhone: "+966509876543", lastMessage: "أحتاج مساعدة في الدفع", timestamp: "منذ 30 دقيقة", unread: 1, assignedTo: "أحمد", status: "waiting", tags: ["دفع"] },
  { id: "4", customerName: "عبدالله سعد", customerPhone: "+966502345678", lastMessage: "هل المنتج متوفر؟", timestamp: "منذ ساعة", unread: 0, assignedTo: "خالد", status: "active", tags: ["استفسار"] },
  { id: "5", customerName: "ريم فهد", customerPhone: "+966503456789", lastMessage: "أريد إرجاع المنتج", timestamp: "منذ ساعتين", unread: 2, assignedTo: "فاطمة", status: "waiting", tags: ["إرجاع"] },
  { id: "6", customerName: "فيصل ناصر", customerPhone: "+966504567890", lastMessage: "تم حل المشكلة، شكراً", timestamp: "أمس", unread: 0, assignedTo: "أحمد", status: "closed", tags: ["تقنية"] },
];

export const messages: Message[] = [
  { id: "1", text: "السلام عليكم، عندي طلب رقم #4521", sender: "customer", timestamp: "10:30 ص" },
  { id: "2", text: "وعليكم السلام، أهلاً بك! دعني أتحقق من الطلب", sender: "agent", timestamp: "10:31 ص" },
  { id: "3", text: "طلبك في مرحلة التوصيل حالياً", sender: "agent", timestamp: "10:32 ص" },
  { id: "4", text: "متى يتم توصيل الطلب؟", sender: "customer", timestamp: "10:33 ص" },
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
