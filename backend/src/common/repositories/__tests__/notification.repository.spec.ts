import { Test, TestingModule } from '@nestjs/testing';
import { NotificationRepository } from '../notification.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('NotificationRepository', () => {
  let repository: NotificationRepository;
  let prisma: any;

  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<NotificationRepository>(NotificationRepository);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should pass through create data', async () => {
      const data = { user: { connect: { id: 'u1' } }, title: 't', message: 'm' };
      prisma.notification.create.mockResolvedValue({ id: 'n1', ...data });

      const result = await repository.create(data as any);

      expect(result).toEqual({ id: 'n1', ...data });
      expect(prisma.notification.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('findByUserId', () => {
    it('should default page=1, limit=20 and order by createdAt desc', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await repository.findByUserId('u1', {});

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should respect explicit page/limit (skip computed correctly)', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await repository.findByUserId('u1', { page: 3, limit: 10 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should add isRead=false filter when unreadOnly=true', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await repository.findByUserId('u1', { unreadOnly: true });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', isRead: false } }),
      );
    });

    it('should NOT add isRead filter when unreadOnly=false', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await repository.findByUserId('u1', { unreadOnly: false });

      const where = prisma.notification.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ userId: 'u1' });
    });

    it('should return { data, meta: { page, limit, total, totalPages } } envelope', async () => {
      prisma.notification.findMany.mockResolvedValue([{ id: 'n1' }]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await repository.findByUserId('u1', {});

      expect(result).toEqual({
        data: [{ id: 'n1' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });
  });

  describe('markAsRead', () => {
    it('should scope updateMany to BOTH id AND userId (no cross-user writes)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await repository.markAsRead('n1', 'u1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', userId: 'u1' },
        data: { isRead: true },
      });
    });

    it('should return the count for caller to detect 0=not found/wrong user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await repository.markAsRead('n1', 'wrong-user');

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('markAllAsRead', () => {
    it('should update all unread notifications for the user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      await repository.markAllAsRead('u1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
        data: { isRead: true },
      });
      expect(prisma.notification.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearAll', () => {
    it('should deleteAll notifications for the user (read + unread)', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 10 });

      await repository.clearAll('u1');

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      const where = prisma.notification.deleteMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('isRead');
    });
  });

  describe('getUnreadCount', () => {
    it('should count only unread notifications for the user', async () => {
      prisma.notification.count.mockResolvedValue(3);

      const result = await repository.getUnreadCount('u1');

      expect(result).toBe(3);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'u1', isRead: false },
      });
    });
  });

  describe('deleteMany', () => {
    it('should pass through Prisma where input', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      await repository.deleteMany({ id: 'n1' });

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { id: 'n1' },
      });
    });
  });
});
