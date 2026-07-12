export type UserRole = "EndUser" | "ITSupport" | "Admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    createdTickets: number;
    assignedTickets: number;
    comments: number;
    attachments: number;
  };
}

export type TicketStatus =
  | "Open"
  | "InProgress"
  | "OnHold"
  | "Resolved"
  | "Closed";
export type TicketPriority = "Low" | "Medium" | "High" | "Critical";
export type SLAStatus = "OnTrack" | "AtRisk" | "Breached";

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: string;
  category?: Category;
  subCategoryId: string | null;
  subCategory?: SubCategory;
  locationId: string | null;
  location: { id: string; name: string } | null;
  itemCode: string;
  requesterId: string;
  requester?: { id: string; name: string; email: string };
  assignedToId: string | null;
  assignedTo: User | null;
  channel: string;
  slaDueAt: string | null;
  slaStatus: SLAStatus | null;
  resolvedAt: string | null;
  closedAt: string | null;
  histories?: AuditTrailEntry[];
  comments?: Comment[];
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
  _count?: { comments: number; attachments: number };
}

export interface Comment {
  id: string;
  ticketId: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role?: string;
    avatarUrl: string | null;
  };
  content: string;
  type: "PUBLIC" | "INTERNAL";
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  ticketId: string;
  commentId: string | null;
  userId: string;
  user?: { id: string; name: string };
  originalName: string;
  size: number;
  mimeType: string;
  visibility: "PUBLIC" | "INTERNAL";
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subCategories?: SubCategory[];
  _count?: { tickets: number; subCategories: number; slaConfigs: number };
}

export interface SubCategory {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { tickets: number; faqs: number };
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface BackupInfo {
  id: string;
  createdAt: string;
  files: {
    db: { exists: boolean; size: number };
    uploads: { exists: boolean; size: number };
  };
}

export interface MaintenanceStatus {
  enabled: boolean;
  message: string | null;
}

export interface NotificationEventOption {
  event: string;
  label: string;
}

export interface NotificationPreferencesMap {
  [event: string]: boolean;
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferencesMap;
  availableEvents: NotificationEventOption[];
}

export interface AuditTrailEntry {
  id: string;
  ticketId: string;
  userId: string;
  user?: { id: string; name: string; email: string };
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type DashboardRangePreset = "7d" | "30d" | "90d" | "custom";

export interface DashboardStatsQuery {
  range: DashboardRangePreset;
  from?: string;
  to?: string;
}

export interface DashboardTicketSummary {
  id: string;
  ticketNumber: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  slaStatus: SLAStatus | null;
  slaDueAt: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
}

export interface DashboardCurrentSnapshot {
  activeTickets: number;
  open: number;
  inProgress: number;
  slaRisk: number;
  unassigned: number;
}

export interface DashboardAttention {
  slaRisk: DashboardTicketSummary[];
  highPriority: DashboardTicketSummary[];
  unassigned: DashboardTicketSummary[];
}

export interface DashboardAnalytics {
  range: {
    preset: DashboardRangePreset;
    from: string;
    to: string;
  };
  trend: { date: string; count: number }[];
  statusCounts: Record<TicketStatus, number>;
  priorityCounts: Record<TicketPriority, number>;
  slaComplianceRate: number;
  avgResolutionTimeByCategory: {
    categoryId: string;
    categoryName: string;
    avgResolutionMinutes: number;
    ticketCount: number;
  }[];
  topCategories: {
    categoryId: string;
    categoryName: string;
    count: number;
  }[];
}

export interface DashboardStats {
  current: DashboardCurrentSnapshot;
  attention: DashboardAttention;
  analytics: DashboardAnalytics;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User & { firstName: string; lastName: string };
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  user: User & { firstName: string; lastName: string };
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  slaStatus?: string;
  search?: string;
  assignedToId?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  locationId?: string;
  requesterId?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  categoryId: string;
  subCategoryId: string;
  locationId: string;
  itemCode: string;
  priority: TicketPriority;
  selfServiceSessionId?: string;
}

export interface Location {
  id: string;
  name: string;
  isActive: boolean;
  _count?: { tickets: number };
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationPayload {
  name: string;
}

export interface UpdateLocationPayload {
  name?: string;
  isActive?: boolean;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
}

export interface CreateCategoryPayload {
  name: string;
  description?: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateSubCategoryPayload {
  name: string;
  description?: string;
  categoryId: string;
}

export interface UpdateSubCategoryPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface SLAConfig {
  id: string;
  categoryId: string;
  category?: Pick<Category, "id" | "name">;
  priority: TicketPriority;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { tickets: number };
}

export interface CreateSLAConfigPayload {
  categoryId: string;
  priority: TicketPriority;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
}
export interface UpdateSLAConfigPayload {
  responseTimeMinutes?: number;
  resolutionTimeMinutes?: number;
  isActive?: boolean;
}

export interface PublicFaq {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
}

export interface Faq extends PublicFaq {
  isActive: boolean;
  showOnLogin: boolean;
  subCategoryId: string;
  keywords: string[];
  subCategory: {
    id: string;
    name: string;
    category: { id: string; name: string };
  };
  createdAt: string;
  updatedAt: string;
}

export interface FaqRecommendation extends PublicFaq {
  subCategoryId: string;
}

export type FaqInteractionPayload =
  | { sessionId: string; eventType: 'RecommendationsShown'; subCategoryId: string }
  | { sessionId: string; eventType: 'ArticleOpened' | 'ProblemResolved'; faqId: string };

export interface FaqMetric {
  faqId: string;
  question: string;
  sessions: number;
}

export interface FaqSubCategoryMetric {
  subCategoryId: string;
  subCategoryName: string;
  categoryName: string;
  recommendationSessions: number;
  resolvedWithoutTicketSessions: number;
  deflectionRate: number;
}

export interface FaqAnalytics {
  range: '30d';
  from: string;
  to: string;
  recommendationSessions: number;
  resolvedWithoutTicketSessions: number;
  continuedToTicketSessions: number;
  deflectionRate: number;
  continuedToTicketRate: number;
  topOpenedFaqs: FaqMetric[];
  topResolvedFaqs: FaqMetric[];
  subCategoryStats: FaqSubCategoryMetric[];
}

export interface TelegramSettings {
  enabledEvents: string[];
  enableGroupChat: boolean;
  groupChatId?: string;
  notifyIndividualsWhenGroupChat: boolean;
  templates: Record<string, string>;
}

export interface TelegramConfig {
  hasBotToken: boolean;
  hasGroupChatId: boolean;
  settings: TelegramSettings;
}

export interface TelegramCheckResult {
  bot: {
    valid: boolean;
    username?: string;
    firstName?: string;
    error?: string;
  };
  groupChat: {
    valid: boolean;
    title?: string;
    type?: string;
    error?: string;
  } | null;
}
