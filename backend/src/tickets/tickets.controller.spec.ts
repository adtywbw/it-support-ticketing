import { Test, TestingModule } from '@nestjs/testing';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { Role } from '@prisma/client';
import { Response } from 'express';

describe('TicketsController', () => {
  let controller: TicketsController;
  let ticketsService: any;

  const mockTicketsService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    assignTicket: jest.fn(),
    updatePriority: jest.fn(),
    delete: jest.fn(),
    exportCsvToResponse: jest.fn(),
  };

  const mockUser = { id: 'user-1', email: 'test@test.com', role: Role.Admin, name: 'Test' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        { provide: TicketsService, useValue: mockTicketsService },
      ],
    }).compile();

    controller = module.get<TicketsController>(TicketsController);
    ticketsService = module.get(TicketsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll()', () => {
    it('should call ticketsService.findAll with query, user role, and user id', async () => {
      const queryDto = { page: 1, limit: 10, status: 'Open' };
      const expectedResult = { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } };
      mockTicketsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(queryDto as any, mockUser);

      expect(ticketsService.findAll).toHaveBeenCalledWith(queryDto, mockUser.role, mockUser.id);
      expect(result).toEqual(expectedResult);
    });

    it('should pass empty query when no filters provided', async () => {
      mockTicketsService.findAll.mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });

      await controller.findAll({} as any, mockUser);

      expect(ticketsService.findAll).toHaveBeenCalledWith({}, mockUser.role, mockUser.id);
    });
  });

  describe('findById()', () => {
    it('should call ticketsService.findById with id, role, and user id', async () => {
      const ticket = { id: 'ticket-1', subject: 'Test' };
      mockTicketsService.findById.mockResolvedValue(ticket);

      const result = await controller.findById('ticket-1', mockUser);

      expect(ticketsService.findById).toHaveBeenCalledWith('ticket-1', mockUser.role, mockUser.id);
      expect(result).toEqual(ticket);
    });
  });

  describe('create()', () => {
    it('should call ticketsService.create with DTO and user id', async () => {
      const createDto = { subject: 'Test ticket', description: 'Test description', categoryId: 'cat-1' };
      const createdTicket = { id: 'ticket-1', ...createDto };
      mockTicketsService.create.mockResolvedValue(createdTicket);

      const result = await controller.create(createDto as any, mockUser.id);

      expect(ticketsService.create).toHaveBeenCalledWith(createDto, mockUser.id);
      expect(result).toEqual(createdTicket);
    });
  });

  describe('updateStatus()', () => {
    it('should call ticketsService.updateStatus with id, DTO, user id, and role', async () => {
      const updateDto = { status: 'InProgress' as any };
      const updatedTicket = { id: 'ticket-1', status: 'InProgress' };
      mockTicketsService.updateStatus.mockResolvedValue(updatedTicket);

      const result = await controller.updateStatus('ticket-1', updateDto, mockUser);

      expect(ticketsService.updateStatus).toHaveBeenCalledWith('ticket-1', updateDto, mockUser.id, mockUser.role);
      expect(result).toEqual(updatedTicket);
    });
  });

  describe('assignTicket()', () => {
    it('should call ticketsService.assignTicket with id, DTO, and user id', async () => {
      const assignDto = { assignedToId: 'support-1' };
      const assignedTicket = { id: 'ticket-1', assignedToId: 'support-1' };
      mockTicketsService.assignTicket.mockResolvedValue(assignedTicket);

      const result = await controller.assignTicket('ticket-1', assignDto as any, mockUser.id);

      expect(ticketsService.assignTicket).toHaveBeenCalledWith('ticket-1', assignDto, mockUser.id);
      expect(result).toEqual(assignedTicket);
    });
  });

  describe('updatePriority()', () => {
    it('should call ticketsService.updatePriority with id, DTO, and user id', async () => {
      const priorityDto = { priority: 'High' as any };
      const updatedTicket = { id: 'ticket-1', priority: 'High' };
      mockTicketsService.updatePriority.mockResolvedValue(updatedTicket);

      const result = await controller.updatePriority('ticket-1', priorityDto, mockUser.id);

      expect(ticketsService.updatePriority).toHaveBeenCalledWith('ticket-1', priorityDto, mockUser.id);
      expect(result).toEqual(updatedTicket);
    });
  });

  describe('delete()', () => {
    it('should call ticketsService.delete with id and userId and return undefined', async () => {
      mockTicketsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete('ticket-1', mockUser.id);

      expect(ticketsService.delete).toHaveBeenCalledWith('ticket-1', mockUser.id);
      expect(result).toBeUndefined();
    });
  });

  describe('exportCsv()', () => {
    it('should set CSV headers and call ticketsService.exportCsvToResponse', async () => {
      const queryDto = { page: 1, limit: 10 };
      const mockRes = {
        setHeader: jest.fn(),
      } as unknown as Response;

      await controller.exportCsv(queryDto as any, mockUser, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="tickets-export.csv"');
      expect(ticketsService.exportCsvToResponse).toHaveBeenCalledWith(mockRes, queryDto, mockUser.role, mockUser.id);
    });
  });
});
