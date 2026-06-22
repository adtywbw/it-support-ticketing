export type UserRole = 'EndUser' | 'ITSupport' | 'Admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus = 'Open' | 'InProgress' | 'OnHold' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type SLAStatus = 'OnTrack' | 'AtRisk' | 'Breached';

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: string;
  category?: Category;
  subCategoryId?: string | null;
  subCategory?: SubCategory;
  requesterId: string;
  requester?: { id: string; name: string; email: string };
  assignedToId?: string | null;
  assignedTo?: User | null;
  channel: string;
  slaDueAt?: string | null;
  slaStatus?: SLAStatus | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
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
  user?: { id: string; name: string; email: string; role?: string; avatarUrl?: string | null };
  content: string;
  type: 'PUBLIC' | 'INTERNAL';
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  ticketId: string;
  userId: string;
  user?: { id: string; name: string };
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subCategories?: SubCategory[];
  _count?: { tickets: number };
}

export interface SubCategory {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { tickets: number };
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

export interface AuditTrailEntry {
  id: string;
  ticketId: string;
  userId: string;
  user?: { id: string; name: string; email: string };
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
  };
}

export interface DashboardStats {
  totalTickets: number;
  ticketsByStatus: { status: string; count: number }[];
  ticketsByPriority: { priority: string; count: number }[];
  slaComplianceRate: number;
  avgResolutionTimeByCategory: { category: string; avgHours: number }[];
  ticketsTrend: { date: string; count: number }[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User & { firstName?: string; lastName?: string };
  accessToken: string;
  refreshToken: string;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  search?: string;
  assignedToId?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  categoryId: string;
  subCategoryId?: string;
  priority: TicketPriority;
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
