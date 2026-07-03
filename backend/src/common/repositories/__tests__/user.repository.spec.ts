import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from '../user.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Role } from '@prisma/client';

describe('UserRepository', () => {
  let repository: UserRepository;
  let prisma: any;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    notification: { deleteMany: jest.fn() },
    ticketHistory: { deleteMany: jest.fn() },
    ticket: { updateMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<UserRepository>(UserRepository);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  const SAFE_USER_FIELDS = expect.objectContaining({
    id: true,
    email: true,
    name: true,
    role: true,
    isActive: true,
    avatarUrl: true,
    createdAt: true,
    updatedAt: true,
  });

  describe('findById', () => {
    it('should query by id and omit password', async () => {
      const user = { id: 'u1', email: 'a@b.com', name: 'A' };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await repository.findById('u1');

      expect(result).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: SAFE_USER_FIELDS,
      });
      const selectArg = prisma.user.findUnique.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('password');
    });

    it('should return null when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await repository.findById('missing')).toBeNull();
    });
  });

  describe('findByIdWithPassword', () => {
    it('should include password field (used for bcrypt compare)', async () => {
      const user = { id: 'u1', email: 'a@b.com', password: 'hashed' };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await repository.findByIdWithPassword('u1');

      expect(result).toEqual(user);
      const selectArg = prisma.user.findUnique.mock.calls[0][0].select;
      expect(selectArg).toHaveProperty('password', true);
    });
  });

  describe('findByEmail', () => {
    it('should query by email and include password for auth flow', async () => {
      const user = { id: 'u1', email: 'a@b.com', password: 'hashed' };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await repository.findByEmail('a@b.com');

      expect(result).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'a@b.com' },
        select: expect.objectContaining({ password: true, email: true }),
      });
    });
  });

  describe('findAll', () => {
    it('should filter to active users by default', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await repository.findAll({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('should include inactive users when includeInactive=true', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await repository.findAll({ includeInactive: true });

      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('isActive');
    });

    it('should apply role filter', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await repository.findAll({ role: 'Admin' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ role: 'Admin' }) }),
      );
    });

    it('should build case-insensitive search on name and email', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await repository.findAll({ search: 'jane' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'jane', mode: 'insensitive' } },
              { email: { contains: 'jane', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should expose safe select (no password) in findMany', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await repository.findAll({});

      const selectArg = prisma.user.findMany.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('password');
    });
  });

  describe('getForValidation', () => {
    it('should select only id, role, isActive', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'Admin', isActive: true });

      await repository.getForValidation('u1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: { id: true, role: true, isActive: true },
      });
    });
  });

  describe('findAssignable', () => {
    it('should return only active ITSupport and Admin users', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'A' }]);

      await repository.findAssignable();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            role: { in: expect.arrayContaining(['ITSupport', 'Admin']) },
          }),
          orderBy: { name: 'asc' },
        }),
      );
    });
  });

  describe('existsByEmail', () => {
    it('should return id and isActive for reactivation check', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false });

      const result = await repository.existsByEmail('a@b.com');

      expect(result).toEqual({ id: 'u1', isActive: false });
      const selectArg = prisma.user.findUnique.mock.calls[0][0].select;
      expect(selectArg).toEqual({ id: true, isActive: true });
    });
  });

  describe('transactionDelete', () => {
    it('should run notifications, history, ticket unassign, user delete in single transaction', async () => {
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.notification.deleteMany.mockReturnValue('notif-op');
      mockPrisma.ticketHistory.deleteMany.mockReturnValue('history-op');
      mockPrisma.ticket.updateMany.mockReturnValue('ticket-op');
      mockPrisma.user.delete.mockReturnValue('user-op');

      await repository.transactionDelete('u1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        'notif-op',
        'history-op',
        'ticket-op',
        'user-op',
      ]);
    });
  });

  describe('findSupportUsers', () => {
    it('selects id and notificationPreferences for active ITSupport/Admin', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 's1', notificationPreferences: null },
      ]);

      const result = await repository.findSupportUsers();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: [Role.ITSupport, Role.Admin] }, isActive: true },
        select: { id: true, notificationPreferences: true },
      });
      expect(result).toEqual([{ id: 's1', notificationPreferences: null }]);
    });
  });

  describe('getNotificationPreferences', () => {
    it('returns an empty map for empty input without querying', async () => {
      const result = await repository.getNotificationPreferences([]);
      expect(result.size).toBe(0);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('fetches prefs for the given ids and returns a map keyed by id', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', notificationPreferences: { 'ticket.created': false } },
        { id: 'u2', notificationPreferences: null },
      ]);

      const result = await repository.getNotificationPreferences(['u1', 'u2']);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['u1', 'u2'] } },
        select: { id: true, notificationPreferences: true },
      });
      expect(result.get('u1')).toEqual({ 'ticket.created': false });
      expect(result.get('u2')).toBeNull();
    });
  });

  describe('setNotificationPreferences', () => {
    it('updates the notificationPreferences column', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        notificationPreferences: { 'ticket.created': false },
      });

      await repository.setNotificationPreferences('u1', { 'ticket.created': false });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { notificationPreferences: { 'ticket.created': false } },
        select: { id: true, notificationPreferences: true },
      });
    });
  });
});
