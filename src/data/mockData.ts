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
}

export interface Message {
  id: string;
  conversationId: string;
  text: string;
  sender: "customer" | "agent" | "system";
  timestamp: string;
  status?: "sent" | "delivered" | "read";
  type?: "text" | "image" | "document" | "note";
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

export const conversations: Conversation[] = [
  { id: "1", customerName: "سارة أحمد", customerPhone: "+966501234567", lastMessage: "متى يتم توصيل الطلب؟", timestamp: "منذ 2 دقيقة", unread: 3, assignedTo: "أحمد", status: "active", tags: ["طلب", "توصيل"], email: "sara@example.com", notes: "عميلة VIP - طلبات متكررة", lastSeen: "متصل الآن" },
  { id: "2", customerName: "محمد علي", customerPhone: "+966507654321", lastMessage: "شكراً لكم على الخدمة الممتازة", timestamp: "منذ 15 دقيقة", unread: 0, assignedTo: "فاطمة", status: "active", tags: ["شكوى محلولة"], email: "mohammed@example.com", lastSeen: "منذ 10 دقائق" },
  { id: "3", customerName: "نورة خالد", customerPhone: "+966509876543", lastMessage: "أحتاج مساعدة في الدفع", timestamp: "منذ 30 دقيقة", unread: 1, assignedTo: "أحمد", status: "waiting", tags: ["دفع"], lastSeen: "منذ 25 دقيقة" },
  { id: "4", customerName: "عبدالله سعد", customerPhone: "+966502345678", lastMessage: "هل المنتج متوفر؟", timestamp: "منذ ساعة", unread: 0, assignedTo: "خالد", status: "active", tags: ["استفسار"], lastSeen: "منذ 45 دقيقة" },
  { id: "5", customerName: "ريم فهد", customerPhone: "+966503456789", lastMessage: "أريد إرجاع المنتج", timestamp: "منذ ساعتين", unread: 2, assignedTo: "فاطمة", status: "waiting", tags: ["إرجاع"], notes: "ترغب بالاستبدال بدل الإرجاع", lastSeen: "منذ ساعة" },
  { id: "6", customerName: "فيصل ناصر", customerPhone: "+966504567890", lastMessage: "تم حل المشكلة، شكراً", timestamp: "أمس", unread: 0, assignedTo: "أحمد", status: "closed", tags: ["تقنية"], lastSeen: "أمس" },
];

export const messagesMap: Record<string, Message[]> = {
  "1": [
    { id: "1-1", conversationId: "1", text: "السلام عليكم، عندي طلب رقم #4521", sender: "customer", timestamp: "10:30 ص", type: "text" },
    { id: "1-2", conversationId: "1", text: "وعليكم السلام، أهلاً بك! دعني أتحقق من الطلب", sender: "agent", timestamp: "10:31 ص", status: "read", type: "text" },
    { id: "1-3", conversationId: "1", text: "طلبك في مرحلة التوصيل حالياً", sender: "agent", timestamp: "10:32 ص", status: "read", type: "text" },
    { id: "1-4", conversationId: "1", text: "متى يتم توصيل الطلب؟", sender: "customer", timestamp: "10:33 ص", type: "text" },
  ],
  "2": [
    { id: "2-1", conversationId: "2", text: "مرحباً، كان عندي مشكلة بالطلب السابق", sender: "customer", timestamp: "9:00 ص", type: "text" },
    { id: "2-2", conversationId: "2", text: "أهلاً محمد، ممكن تعطيني رقم الطلب؟", sender: "agent", timestamp: "9:02 ص", status: "read", type: "text" },
    { id: "2-3", conversationId: "2", text: "رقم الطلب #3892", sender: "customer", timestamp: "9:03 ص", type: "text" },
    { id: "2-4", conversationId: "2", text: "تم حل المشكلة وإعادة المبلغ لحسابك", sender: "agent", timestamp: "9:10 ص", status: "read", type: "text" },
    { id: "2-5", conversationId: "2", text: "شكراً لكم على الخدمة الممتازة", sender: "customer", timestamp: "9:15 ص", type: "text" },
  ],
  "3": [
    { id: "3-1", conversationId: "3", text: "السلام عليكم، أحتاج مساعدة بخصوص الدفع", sender: "customer", timestamp: "11:00 ص", type: "text" },
    { id: "3-2", conversationId: "3", text: "أهلاً نورة، كيف أقدر أساعدك؟", sender: "agent", timestamp: "11:05 ص", status: "delivered", type: "text" },
    { id: "3-3", conversationId: "3", text: "أحتاج مساعدة في الدفع", sender: "customer", timestamp: "11:10 ص", type: "text" },
  ],
  "4": [
    { id: "4-1", conversationId: "4", text: "مرحباً، هل المنتج XYZ متوفر؟", sender: "customer", timestamp: "8:30 ص", type: "text" },
    { id: "4-2", conversationId: "4", text: "أهلاً عبدالله، نعم المنتج متوفر حالياً", sender: "agent", timestamp: "8:35 ص", status: "read", type: "text" },
    { id: "4-3", conversationId: "4", text: "هل المنتج متوفر؟", sender: "customer", timestamp: "8:40 ص", type: "text" },
  ],
  "5": [
    { id: "5-1", conversationId: "5", text: "أريد إرجاع المنتج اللي اشتريته أمس", sender: "customer", timestamp: "2:00 م", type: "text" },
    { id: "5-2", conversationId: "5", text: "ممكن تعطيني السبب؟", sender: "agent", timestamp: "2:05 م", status: "read", type: "text" },
    { id: "5-3", conversationId: "5", text: "المقاس غير مناسب", sender: "customer", timestamp: "2:10 م", type: "text" },
    { id: "5-4", conversationId: "5", text: "أريد إرجاع المنتج", sender: "customer", timestamp: "2:15 م", type: "text" },
  ],
  "6": [
    { id: "6-1", conversationId: "6", text: "عندي مشكلة تقنية بالتطبيق", sender: "customer", timestamp: "أمس 3:00 م", type: "text" },
    { id: "6-2", conversationId: "6", text: "ممكن تشرح لي المشكلة بالتفصيل؟", sender: "agent", timestamp: "أمس 3:05 م", status: "read", type: "text" },
    { id: "6-3", conversationId: "6", text: "تم تحديث التطبيق وحل المشكلة", sender: "agent", timestamp: "أمس 3:30 م", status: "read", type: "text" },
    { id: "6-4", conversationId: "6", text: "تم إغلاق المحادثة", sender: "system", timestamp: "أمس 3:35 م", type: "text" },
    { id: "6-5", conversationId: "6", text: "تم حل المشكلة، شكراً", sender: "customer", timestamp: "أمس 4:00 م", type: "text" },
  ],
};

// Keep backward compat
export const messages = messagesMap["1"];

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
