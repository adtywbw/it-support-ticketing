import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentRepository } from '../attachment.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AttachmentRepository', () => {
  let repository: AttachmentRepository;
  let prisma: any;

  const mockPrisma = {
    attachment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<AttachmentRepository>(AttachmentRepository);
    prisma = module.get(PrismaService);
    jest.resetAllMocks();
  });

  describe('create', () => {
    it('should pass through create data + include', async () => {
      prisma.attachment.create.mockResolvedValueOnce({ id: 'a1' });

      await repository.create({ path: 'p', ticket: { connect: { id: 't1' } } } as any, { user: true });

      expect(prisma.attachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ path: 'p' }),
        include: { user: true },
      });
    });
  });

  describe('findByTicketId', () => {
    it('should filter by ticketId by default and order by createdAt desc', async () => {
      prisma.attachment.findMany.mockResolvedValueOnce([]);

      await repository.findByTicketId('t1');

      expect(prisma.attachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ticketId: 't1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should respect custom where (e.g. visibility filter from AttachmentVisibilityPolicy)', async () => {
      prisma.attachment.findMany.mockResolvedValueOnce([]);

      await repository.findByTicketId('t1', {
        where: { visibility: 'PUBLIC' },
      });

      expect(prisma.attachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { visibility: 'PUBLIC' } }),
      );
    });

    it('should respect skip/take when provided', async () => {
      prisma.attachment.findMany.mockResolvedValueOnce([]);

      await repository.findByTicketId('t1', { skip: 5, take: 10 });

      expect(prisma.attachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 10 }),
      );
    });

    it('should prefer select over include when both provided', async () => {
      prisma.attachment.findMany.mockResolvedValueOnce([]);

      await repository.findByTicketId('t1', {
        select: { id: true, path: true },
        include: { user: true },
      });

      const args = prisma.attachment.findMany.mock.calls[0][0];
      expect(args).toHaveProperty('select');
      expect(args).not.toHaveProperty('include');
    });

    it('should use include when select is not provided', async () => {
      prisma.attachment.findMany.mockResolvedValueOnce([]);

      await repository.findByTicketId('t1', { include: { user: true } });

      const args = prisma.attachment.findMany.mock.calls[0][0];
      expect(args).toHaveProperty('include');
    });
  });

  describe('findById', () => {
    it('should query by id with optional include', async () => {
      prisma.attachment.findUnique.mockResolvedValueOnce({ id: 'a1' });

      await repository.findById('a1', { ticket: true });

      expect(prisma.attachment.findUnique).toHaveBeenCalledWith({
        where: { id: 'a1' },
        include: { ticket: true },
      });
    });
  });

  describe('count', () => {
    it('should pass through where', async () => {
      prisma.attachment.count.mockResolvedValueOnce(3);

      await repository.count({ ticketId: 't1' });

      expect(prisma.attachment.count).toHaveBeenCalledWith({ where: { ticketId: 't1' } });
    });
  });

  describe('deleteMany', () => {
    it('should pass through where', async () => {
      prisma.attachment.deleteMany.mockResolvedValueOnce({ count: 2 });

      await repository.deleteMany({ ticketId: 't1' });

      expect(prisma.attachment.deleteMany).toHaveBeenCalledWith({ where: { ticketId: 't1' } });
    });
  });

  describe('transaction', () => {
    it('should call $transaction with fn and options', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      mockPrisma.$transaction.mockResolvedValueOnce('ok');

      const result = await repository.transaction(fn, { isolationLevel: 'Serializable' as any });

      expect(result).toBe('ok');
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(fn, { isolationLevel: 'Serializable' });
    });
  });
});
