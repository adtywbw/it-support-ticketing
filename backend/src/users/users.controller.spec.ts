import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Role } from '@prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: any;

  const mockUsersService = {
    findAll: jest.fn(),
    findAssignable: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll()', () => {
    it('should call usersService.findAll with query params', async () => {
      const query = { page: 1, limit: 10, role: Role.ITSupport, search: 'test', includeInactive: 'true' };
      mockUsersService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });

      await controller.findAll(query as any);

      expect(usersService.findAll).toHaveBeenCalledWith({
        page: 1, limit: 10, role: Role.ITSupport, search: 'test', includeInactive: true,
      });
    });

    it('should pass includeInactive as false when not set', async () => {
      mockUsersService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });

      await controller.findAll({} as any);

      expect(usersService.findAll).toHaveBeenCalledWith({
        page: undefined, limit: undefined, role: undefined, search: undefined, includeInactive: false,
      });
    });
  });

  describe('findAssignable()', () => {
    it('should call usersService.findAssignable', async () => {
      mockUsersService.findAssignable.mockResolvedValue([{ id: 'u1', name: 'Support' }]);

      const result = await controller.findAssignable();

      expect(usersService.findAssignable).toHaveBeenCalled();
      expect(result).toEqual([{ id: 'u1', name: 'Support' }]);
    });
  });

  describe('findById()', () => {
    it('should call usersService.findById with id', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'u1', email: 'test@test.com' });

      const result = await controller.findById('u1');

      expect(usersService.findById).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ id: 'u1', email: 'test@test.com' });
    });
  });

  describe('create()', () => {
    it('should call usersService.create with DTO', async () => {
      const dto = { email: 'new@test.com', password: 'Password123!', name: 'New User', role: Role.ITSupport };
      mockUsersService.create.mockResolvedValue({ id: 'new1', email: 'new@test.com' });

      const result = await controller.create(dto as any);

      expect(usersService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ id: 'new1', email: 'new@test.com' });
    });
  });

  describe('update()', () => {
    it('should call usersService.update with id and DTO', async () => {
      const dto = { name: 'Updated' };
      mockUsersService.update.mockResolvedValue({ id: 'u1', name: 'Updated' });

      const result = await controller.update('u1', dto as any);

      expect(usersService.update).toHaveBeenCalledWith('u1', dto);
      expect(result).toEqual({ id: 'u1', name: 'Updated' });
    });
  });

  describe('delete()', () => {
    it('should call usersService.delete with id and current user id', async () => {
      mockUsersService.delete.mockResolvedValue(undefined);

      const result = await controller.delete('u1', { id: 'admin-1' });

      expect(usersService.delete).toHaveBeenCalledWith('u1', 'admin-1');
      expect(result).toEqual({ message: 'User deleted successfully' });
    });
  });
});
