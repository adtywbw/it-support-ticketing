import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
import { buildPaginationMeta } from '../utils/pagination.util';

const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { createdTickets: true, assignedTickets: true, comments: true, attachments: true } },
} as const;

const USER_SAFE_SELECT_WITH_PASSWORD = {
  ...USER_SAFE_SELECT,
  password: true,
} as const;

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });
  }

  async findByIdWithPassword(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT_WITH_PASSWORD,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: USER_SAFE_SELECT_WITH_PASSWORD,
    });
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    role?: string;
    search?: string;
    includeInactive?: boolean;
  }) {
    const { page = 1, limit = 10, role, search, includeInactive } = params;
    const where: Prisma.UserWhereInput = {};
    if (!includeInactive) where.isActive = true;
    if (role) where.role = role as Role;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: USER_SAFE_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: users, meta: buildPaginationMeta(total, limit, page) };
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SAFE_SELECT,
    });
  }

  async getForValidation(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
  }

  async findSupportUsers() {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.ITSupport, Role.Admin] }, isActive: true },
      select: { id: true, notificationPreferences: true },
    });
  }

  async getNotificationPreferences(userIds: string[]): Promise<Map<string, unknown>> {
    if (userIds.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, notificationPreferences: true },
    });
    return new Map(users.map((u) => [u.id, u.notificationPreferences]));
  }

  async setNotificationPreferences(
    userId: string,
    prefs: Record<string, boolean>,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: prefs as Prisma.InputJsonValue },
      select: { id: true, notificationPreferences: true },
    });
  }

  async findAssignable() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.ITSupport, Role.Admin] },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async findAllActive() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async findTelegramLinkedUsers() {
    return this.prisma.user.findMany({
      where: {
        role: { in: [Role.ITSupport, Role.Admin] },
        isActive: true,
        telegramChatId: { not: null },
      },
      select: { telegramChatId: true },
    });
  }

  async findWithTelegramCode(code: string) {
    return this.prisma.user.findFirst({
      where: {
        telegramCode: code,
        telegramCodeAt: { gte: new Date() },
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        telegramCode: true,
        telegramCodeAt: true,
      },
    });
  }

  async getTelegramChatId(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { telegramChatId: true },
    });
  }

  async existsByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
  }

  async transactionDelete(id: string) {
    return this.prisma.$transaction([
      this.prisma.notification.deleteMany({ where: { userId: id } }),
      this.prisma.ticketHistory.deleteMany({ where: { userId: id } }),
      this.prisma.ticket.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
      this.prisma.user.delete({ where: { id } }),
    ]);
  }
}
