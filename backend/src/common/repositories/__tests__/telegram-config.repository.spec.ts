import { Test, TestingModule } from '@nestjs/testing';
import { TelegramConfigRepository } from '../telegram-config.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('TelegramConfigRepository — singleton access', () => {
  let repository: TelegramConfigRepository;
  let prisma: any;

  const mockPrisma = {
    telegramConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramConfigRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<TelegramConfigRepository>(TelegramConfigRepository);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('findFirst()', () => {
    it('should resolve singleton by key = "default" using findUnique', async () => {
      const config = { id: '1', key: 'default', botToken: 'tok' };
      prisma.telegramConfig.findUnique.mockResolvedValue(config);

      const result = await repository.findFirst();

      expect(result).toEqual(config);
      expect(prisma.telegramConfig.findUnique).toHaveBeenCalledWith({
        where: { key: 'default' },
      });
      // Must NOT use findFirst (non-deterministic)
      expect(prisma.telegramConfig.findFirst).toBeUndefined();
    });
  });

  describe('findUniqueByKey()', () => {
    it('should find by the given key', async () => {
      const config = { id: '1', key: 'default', botToken: 'tok' };
      prisma.telegramConfig.findUnique.mockResolvedValue(config);

      const result = await repository.findUniqueByKey('default');

      expect(result).toEqual(config);
      expect(prisma.telegramConfig.findUnique).toHaveBeenCalledWith({
        where: { key: 'default' },
      });
    });
  });

  describe('findOrCreate() — atomic upsert', () => {
    it('should use upsert on key = "default" (single atomic call)', async () => {
      const config = { id: '1', key: 'default', botToken: null, settings: {} };
      prisma.telegramConfig.upsert.mockResolvedValue(config);

      const result = await repository.findOrCreate({ settings: {} });

      expect(result).toEqual(config);
      // Single upsert call — no findFirst + create race
      expect(prisma.telegramConfig.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.telegramConfig.upsert).toHaveBeenCalledWith({
        where: { key: 'default' },
        create: { key: 'default', settings: {} },
        update: {},
      });
    });

    it('should return existing config without modifying it', async () => {
      const existing = { id: '1', key: 'default', botToken: 'tok', settings: { foo: true } };
      prisma.telegramConfig.upsert.mockResolvedValue(existing);

      const result = await repository.findOrCreate();

      expect(result).toEqual(existing);
      expect(prisma.telegramConfig.upsert).toHaveBeenCalledWith({
        where: { key: 'default' },
        create: { key: 'default' },
        update: {},
      });
    });

    it('should not call findFirst or create separately', async () => {
      prisma.telegramConfig.upsert.mockResolvedValue({ id: '1', key: 'default' });

      await repository.findOrCreate();

      // The old implementation called findFirst() then create().
      // The new implementation must only call upsert().
      expect(prisma.telegramConfig.findUnique).not.toHaveBeenCalled();
      expect(prisma.telegramConfig.create).not.toHaveBeenCalled();
    });
  });

  describe('create()', () => {
    it('should always set key = "default"', async () => {
      const config = { id: '1', key: 'default', botToken: 'tok' };
      prisma.telegramConfig.create.mockResolvedValue(config);

      await repository.create({ botToken: 'tok' });

      expect(prisma.telegramConfig.create).toHaveBeenCalledWith({
        data: { key: 'default', botToken: 'tok' },
      });
    });
  });

  describe('concurrent findOrCreate — no race', () => {
    it('should handle concurrent calls safely via upsert', async () => {
      const config = { id: '1', key: 'default', botToken: null };
      prisma.telegramConfig.upsert.mockResolvedValue(config);

      // Simulate concurrent calls
      const [r1, r2, r3] = await Promise.all([
        repository.findOrCreate(),
        repository.findOrCreate(),
        repository.findOrCreate(),
      ]);

      // All should return the same config
      expect(r1).toEqual(config);
      expect(r2).toEqual(config);
      expect(r3).toEqual(config);

      // upsert is called 3 times, but each is atomic — no race condition
      expect(prisma.telegramConfig.upsert).toHaveBeenCalledTimes(3);
      // No create calls (which would race with unique constraint violation)
      expect(prisma.telegramConfig.create).not.toHaveBeenCalled();
    });
  });
});
