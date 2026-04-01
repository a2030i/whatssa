// Interfaces only — no mock data. All data comes from the database.

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
  channelType?: "meta_api" | "evolution";
  channelId?: string;
  channelName?: string;
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

export interface MessageReaction {
  emoji: string;
  fromMe: boolean;
  timestamp?: string;
}

export interface MessageLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface MessageContact {
  name: string;
  phone: string;
  email?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  text: string;
  sender: "customer" | "agent" | "system";
  timestamp: string;
  status?: "sent" | "delivered" | "read";
  type?: "text" | "image" | "document" | "note" | "template" | "audio" | "video" | "location" | "contacts" | "sticker" | "reaction" | "poll";
  mediaUrl?: string;
  senderName?: string;
  quoted?: {
    stanza_id?: string;
    message_id?: string;
    sender_name?: string;
    text?: string;
  };
  waMessageId?: string;
  reactions?: MessageReaction[];
  location?: MessageLocation;
  contacts?: MessageContact[];
  editedAt?: string;
  isDeleted?: boolean;
  poll?: {
    question: string;
    options: { id: string; title: string }[];
    votes?: Record<string, string[]>; // option_id -> voter phones
  };
  createdAt?: string;
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
