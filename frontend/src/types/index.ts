export type UserRole = 'User' | 'ITSupport' | 'Admin';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus = 'Open' | 'InProgress' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type SLAMetStatus = 'Met' | 'Breached' | 'Pending';

export interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: number;
  category?: Category;
  subCategoryId?: number;
  subCategory?: SubCategory;
  createdById: number;
  createdBy?: User;
  assignedToId?: number;
  assignedTo?: User;
  slaDeadline?: string;
  slaMetStatus: SLAMetStatus;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

export interface Comment {
  id: number;
  ticketId: number;
  userId: number;
  user?: User;
  content: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: number;
  ticketId: number;
  uploadedById: number;
  uploadedBy?: User;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  slaHours?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subCategories?: SubCategory[];
}

export interface SubCategory {
  id: number;
  categoryId: number;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditTrailEntry {
  id: number;
  ticketId: number;
  userId: number;
  user?: User;
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
    totalPages: number;
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
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  search?: string;
  assignedToId?: number;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  categoryId?: number;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  categoryId: number;
  subCategoryId?: number;
  priority: TicketPriority;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface CreateCategoryPayload {
  name: string;
  description?: string;
  slaHours?: number;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string;
  slaHours?: number;
  isActive?: boolean;
}

export interface CreateSubCategoryPayload {
  name: string;
  description?: string;
  categoryId: number;
}

export interface UpdateSubCategoryPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}
