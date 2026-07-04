import { Test, TestingModule } from '@nestjs/testing';
import { LandingPageConfigRepository } from '../landing-page-config.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('LandingPageConfigRepository — singleton access', () => {
  let repository: LandingPageConfigRepository;
  let prisma: any;

  const mockPrisma = {
    landingPageConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandingPageConfigRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<LandingPageConfigRepository>(LandingPageConfigRepository);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('findUniqueByKey()', () => {
    it('should resolve singleton by key = "default" using findUnique', async () => {
      const config = { id: '1', key: 'default', contact: {}, faqs: [] };
      prisma.landingPageConfig.findUnique.mockResolvedValue(config);

      const result = await repository.findUniqueByKey();

      expect(result).toEqual(config);
      expect(prisma.landingPageConfig.findUnique).toHaveBeenCalledWith({
        where: { key: 'default' },
      });
    });

    it('should find by a custom key when provided', async () => {
      const config = { id: '1', key: 'custom', contact: {}, faqs: [] };
      prisma.landingPageConfig.findUnique.mockResolvedValue(config);

      const result = await repository.findUniqueByKey('custom');

      expect(result).toEqual(config);
      expect(prisma.landingPageConfig.findUnique).toHaveBeenCalledWith({
        where: { key: 'custom' },
      });
    });
  });

  describe('findOrCreate() — atomic upsert', () => {
    it('should use upsert on key = "default" (single atomic call)', async () => {
      const config = { id: '1', key: 'default', contact: {}, faqs: [] };
      prisma.landingPageConfig.upsert.mockResolvedValue(config);

      const result = await repository.findOrCreate({ contact: {} });

      expect(result).toEqual(config);
      expect(prisma.landingPageConfig.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.landingPageConfig.upsert).toHaveBeenCalledWith({
        where: { key: 'default' },
        create: { key: 'default', contact: {} },
        update: {},
      });
    });

    it('should return existing config without modifying it', async () => {
      const existing = { id: '1', key: 'default', contact: { email: 'a@b.com' }, faqs: [] };
      prisma.landingPageConfig.upsert.mockResolvedValue(existing);

      const result = await repository.findOrCreate();

      expect(result).toEqual(existing);
      expect(prisma.landingPageConfig.upsert).toHaveBeenCalledWith({
        where: { key: 'default' },
        create: { key: 'default' },
        update: {},
      });
    });

    it('should not call findFirst or create separately', async () => {
      prisma.landingPageConfig.upsert.mockResolvedValue({ id: '1', key: 'default' });

      await repository.findOrCreate();

      expect(prisma.landingPageConfig.create).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('should update the singleton by key = "default"', async () => {
      const updated = { id: '1', key: 'default', contact: { email: 'new@b.com' }, faqs: [] };
      prisma.landingPageConfig.update.mockResolvedValue(updated);

      const result = await repository.update({ contact: { email: 'new@b.com' } });

      expect(result).toEqual(updated);
      expect(prisma.landingPageConfig.update).toHaveBeenCalledWith({
        where: { key: 'default' },
        data: { contact: { email: 'new@b.com' } },
      });
    });
  });

  describe('concurrent findOrCreate — no race', () => {
    it('should handle concurrent calls safely via upsert', async () => {
      const config = { id: '1', key: 'default', contact: {}, faqs: [] };
      prisma.landingPageConfig.upsert.mockResolvedValue(config);

      const [r1, r2, r3] = await Promise.all([
        repository.findOrCreate(),
        repository.findOrCreate(),
        repository.findOrCreate(),
      ]);

      expect(r1).toEqual(config);
      expect(r2).toEqual(config);
      expect(r3).toEqual(config);
      expect(prisma.landingPageConfig.upsert).toHaveBeenCalledTimes(3);
      expect(prisma.landingPageConfig.create).not.toHaveBeenCalled();
    });
  });
});