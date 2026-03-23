// ============================================================
//  types.ts — Shared types for the ALTUM Chat System
// ============================================================

export type TimestampLike = {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
} | number | null | undefined;

// ── Chat ────────────────────────────────────────────────────
export type ChatStatus = "open" | "pending" | "snoozed" | "resolved" | "spam";
export type ChatPriority = "urgent" | "high" | "normal" | "low";
export type ChatChannel = "whatsapp" | "instagram" | "email" | "webchat";

export type ChatDoc = {
  id: string;
  tenantId?: string;
  contactName?: string;
  contactPhone?: string;
  contactPhotoUrl?: string;
  contactStatusMessage?: string;
  contactLastSeen?: TimestampLike;
  contactEmail?: string;
  isOnline?: boolean;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerPhotoUrl?: string | null;
  leadId?: string | null;
  lastMessage?: string;
  lastMessageTime?: TimestampLike;
  lastMessageSender?: "agent" | "client";
  unreadCount?: number;
  pinned?: boolean;
  tags?: string[];
  status?: ChatStatus;
  priority?: ChatPriority;
  channel?: ChatChannel;
  labels?: string[];
  snoozedUntil?: TimestampLike;
  conversationId?: string; // WhatsApp conversation ID
  wabaId?: string;
  firstResponseAt?: TimestampLike;
  resolvedAt?: TimestampLike;
  csat?: number; // 1-5
};

// ── Message ─────────────────────────────────────────────────
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed" | "deleted";
export type MessageType =
  | "text"
  | "audio"
  | "image"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "template"
  | "interactive"
  | "system"
  | "internal_note"
  | "activity";

export type MessageDoc = {
  id: string;
  chatId: string;
  text?: string;
  sender?: "agent" | "client" | "system" | "bot";
  agentId?: string;
  agentName?: string;
  agentPhotoUrl?: string;
  createdAt?: TimestampLike;
  type?: MessageType;
  mediaUrl?: string;
  mediaName?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  mediaDuration?: number;
  mediaWidth?: number;
  mediaHeight?: number;
  mediaThumbnail?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  status?: MessageStatus;
  waMessageId?: string; // WhatsApp message ID (wamid)
  replyToId?: string | null;
  replyToMessage?: Pick<MessageDoc, "id" | "text" | "type" | "sender" | "mediaThumbnail">;
  reactions?: Record<string, string[]>; // emoji → array of uids
  pinned?: boolean;
  edited?: boolean;
  editedAt?: TimestampLike;
  deleted?: boolean;
  deletedAt?: TimestampLike;
  internal?: boolean;
  starred?: boolean;
  templateName?: string;
  templateParams?: string[];
  interactiveType?: "button" | "list" | "product";
  interactiveData?: Record<string, unknown>;
  deliveredAt?: TimestampLike;
  readAt?: TimestampLike;
  failureReason?: string;
  _temp?: boolean;
  _failed?: boolean;
  _uploadProgress?: number;
};

// ── Team ────────────────────────────────────────────────────
export type AgentStatus = "online" | "busy" | "away" | "offline";

export type TeamUser = {
  id: string;
  name: string;
  email?: string;
  role: string;
  status: string;
  agentStatus?: AgentStatus;
  photoUrl?: string;
  teamIds?: string[];
  maxConversations?: number;
  currentConversations?: number;
};

export type Team = {
  id: string;
  name: string;
  description?: string;
  memberIds?: string[];
};

// ── Lead / CRM ───────────────────────────────────────────────
export type LeadContext = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  status?: string;
  pipelineStage?: string;
  pipelineName?: string;
  ownerId?: string;
  ownerName?: string;
  value?: number;
  currency?: string;
  source?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  customFields?: Record<string, string | number | boolean>;
  tags?: string[];
  score?: number;
  lostReason?: string;
};

// ── Contact Details (richer) ─────────────────────────────────
export type ContactDoc = {
  id: string;
  tenantId?: string;
  leadId?: string;
  name?: string;
  phone?: string;
  externalProfileId?: string;
  email?: string;
  photoUrl?: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
  tags?: string[];
  customFields?: Record<string, string>;
  totalConversations?: number;
  firstSeenAt?: TimestampLike;
  lastSeenAt?: TimestampLike;
  location?: string;
  language?: string;
  timezone?: string;
  browser?: string;
  os?: string;
  ip?: string;
};

// ── Notification ─────────────────────────────────────────────
export type Notification = {
  id: string;
  type: "mention" | "assignment" | "reply" | "resolution" | "system";
  title: string;
  body?: string;
  chatId?: string;
  messageId?: string;
  read?: boolean;
  createdAt?: TimestampLike;
};

// ── Analytics ────────────────────────────────────────────────
export type DashboardMetrics = {
  openChats: number;
  pendingChats: number;
  resolvedToday: number;
  avgFirstResponseSec: number;
  avgResolutionSec: number;
  csatScore: number;
  agentsOnline: number;
  messagesIn24h: number;
};

// ── Template ─────────────────────────────────────────────────
export type WaTemplate = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  components: TemplateComponent[];
};

export type TemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  buttons?: TemplateButton[];
};

export type TemplateButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone?: string;
};

// ── Macro / Canned Response ───────────────────────────────────
export type CannedResponse = {
  id: string;
  shortCode: string;
  content: string;
  teamId?: string;
  createdBy?: string;
};

// ── Audit Log ────────────────────────────────────────────────
export type AuditEvent = {
  id: string;
  chatId: string;
  actorId?: string;
  actorName?: string;
  type:
    | "assigned"
    | "unassigned"
    | "transferred"
    | "resolved"
    | "reopened"
    | "snoozed"
    | "label_added"
    | "label_removed"
    | "priority_changed"
    | "status_changed"
    | "note_added"
    | "template_sent";
  meta?: Record<string, unknown>;
  createdAt?: TimestampLike;
};
