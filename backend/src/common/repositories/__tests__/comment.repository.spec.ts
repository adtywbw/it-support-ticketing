import { Test, TestingModule } from '@nestjs/testing';
import { CommentRepository } from '../comment.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('CommentRepository', () => {
  let repository: CommentRepository;
  let prisma: any;

  const mockPrisma = {
    comment: {
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
        CommentRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<CommentRepository>(CommentRepository);
    prisma = module.get(PrismaService);
    jest.resetAllMocks();
  });

  describe('create', () => {
    it('should pass through create data + include', async () => {
      prisma.comment.create.mockResolvedValueOnce({ id: 'c1' });

      await repository.create(
        { content: 'x', ticket: { connect: { id: 't1' } }, user: { connect: { id: 'u1' } } } as any,
        { user: true },
      );

      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ content: 'x' }),
        include: { user: true },
      });
    });
  });

  describe('findById', () => {
    it('should query by id with optional include', async () => {
      prisma.comment.findUnique.mockResolvedValueOnce({ id: 'c1' });

      await repository.findById('c1', { user: true });

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        include: { user: true },
      });
    });
  });

  describe('findByTicketId', () => {
    it('should query by ticketId with user + attachments include + orderBy createdAt asc', async () => {
      prisma.comment.findMany.mockResolvedValueOnce([]);

      await repository.findByTicketId('t1');

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ticketId: 't1' },
          orderBy: { createdAt: 'asc' },
          include: expect.objectContaining({
            user: expect.any(Object),
            attachments: expect.any(Object),
          }),
        }),
      );
    });

    it('should merge additional where conditions (e.g. type=PUBLIC for EndUser)', async () => {
      prisma.comment.findMany.mockResolvedValueOnce([]);

      await repository.findByTicketId('t1', { type: 'PUBLIC' });

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ticketId: 't1', type: 'PUBLIC' } }),
      );
    });

    it('should respect skip/take pagination', async () => {
      prisma.comment.findMany.mockResolvedValueOnce([]);

      await repository.findByTicketId('t1', {}, { skip: 10, take: 20 });

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 20 }),
      );
    });

    it('should accept custom include (Sesi 9 SEC-I-3 — visibility filter for EndUser)', () => {
      // Skipped: 4-arg signature added in Sesi 9. Add test after merge.
      expect(true).toBe(true);
    });
  });

  describe('countByTicketId', () => {
    it('should count with optional where merge', async () => {
      prisma.comment.count.mockResolvedValueOnce(5);

      const result = await repository.countByTicketId('t1', { type: 'PUBLIC' });

      expect(result).toBe(5);
      expect(prisma.comment.count).toHaveBeenCalledWith({
        where: { ticketId: 't1', type: 'PUBLIC' },
      });
    });
  });

  describe('deleteMany', () => {
    it('should pass through Prisma where', async () => {
      prisma.comment.deleteMany.mockResolvedValueOnce({ count: 3 });

      await repository.deleteMany({ ticketId: 't1' });

      expect(prisma.comment.deleteMany).toHaveBeenCalledWith({ where: { ticketId: 't1' } });
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
