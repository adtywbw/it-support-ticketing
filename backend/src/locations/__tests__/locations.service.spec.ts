import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { LocationsService } from '../locations.service';
import { LocationRepository } from '../../common/repositories/location.repository';

describe('LocationsService', () => {
  let service: LocationsService;
  let repo: jest.Mocked<LocationRepository>;

  beforeEach(async () => {
    const mockRepo = {
      findAll: jest.fn(),
      findAllForForm: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: LocationRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    repo = module.get(LocationRepository);
  });

  describe('findAll', () => {
    it('should return all locations including inactive', async () => {
      const locations = [{ id: '1', name: 'HQ' }];
      repo.findAll.mockResolvedValue(locations as any);
      const result = await service.findAll();
      expect(repo.findAll).toHaveBeenCalledWith(true);
      expect(result).toBe(locations);
    });
  });

  describe('findById', () => {
    it('should return location when found', async () => {
      const location = { id: '1', name: 'HQ' };
      repo.findById.mockResolvedValue(location as any);
      const result = await service.findById('1');
      expect(result).toBe(location);
    });

    it('should throw NotFoundException when not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create new location when name does not exist', async () => {
      repo.findByName.mockResolvedValue(null);
      repo.create.mockResolvedValue({ id: '1', name: 'Branch' } as any);
      const result = await service.create({ name: 'Branch' } as any);
      expect(repo.findByName).toHaveBeenCalledWith('Branch');
      expect(repo.create).toHaveBeenCalledWith({ name: 'Branch' });
      expect(result).toEqual({ id: '1', name: 'Branch' });
    });

    it('should reactivate existing inactive location', async () => {
      repo.findByName.mockResolvedValue({ id: '1', name: 'Branch', isActive: false } as any);
      repo.update.mockResolvedValue({ id: '1', name: 'Branch', isActive: true } as any);
      const result = await service.create({ name: 'Branch' } as any);
      expect(repo.update).toHaveBeenCalledWith('1', { isActive: true });
      expect(result).toEqual({ id: '1', name: 'Branch', isActive: true });
    });

    it('should throw ConflictException when active location with same name exists', async () => {
      repo.findByName.mockResolvedValue({ id: '1', name: 'Branch', isActive: true } as any);
      await expect(service.create({ name: 'Branch' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update location when found and name not taken', async () => {
      repo.findById.mockResolvedValue({ id: '1', name: 'Old' } as any);
      repo.findByName.mockResolvedValue(null);
      repo.update.mockResolvedValue({ id: '1', name: 'New' } as any);
      const result = await service.update('1', { name: 'New' } as any);
      expect(repo.update).toHaveBeenCalledWith('1', { name: 'New' });
      expect(result).toEqual({ id: '1', name: 'New' });
    });

    it('should throw NotFoundException when not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('1', { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when name already used by another location', async () => {
      repo.findById.mockResolvedValue({ id: '1', name: 'Old' } as any);
      repo.findByName.mockResolvedValue({ id: '2', name: 'Taken' } as any);
      await expect(service.update('1', { name: 'Taken' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException when not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.delete('1')).rejects.toThrow(NotFoundException);
    });

    it('should soft-delete (deactivate) when location has tickets', async () => {
      repo.findById.mockResolvedValue({ id: '1', _count: { tickets: 5 } } as any);
      await service.delete('1');
      expect(repo.update).toHaveBeenCalledWith('1', { isActive: false });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('should hard-delete when location has no tickets', async () => {
      repo.findById.mockResolvedValue({ id: '1', _count: { tickets: 0 } } as any);
      await service.delete('1');
      expect(repo.delete).toHaveBeenCalledWith('1');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('should handle missing _count gracefully (treat as 0)', async () => {
      repo.findById.mockResolvedValue({ id: '1', _count: undefined } as any);
      await service.delete('1');
      expect(repo.delete).toHaveBeenCalledWith('1');
    });
  });
});
