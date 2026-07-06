import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { Response } from 'express';

jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
}));

describe('AttachmentsController', () => {
  let controller: AttachmentsController;
  let service: any;

  const mockService = {
    upload: jest.fn(),
    findByTicketId: jest.fn(),
    getDownloadInfo: jest.fn(),
  };

  const mockUser = { id: 'user-1', role: 'Admin' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [{ provide: AttachmentsService, useValue: mockService }],
    }).compile();
    controller = module.get<AttachmentsController>(AttachmentsController);
    service = module.get(AttachmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upload()', () => {
    it('should call service.upload with ticketId, file, user, and visibility', async () => {
      const file = { originalname: 'test.pdf', mimetype: 'application/pdf', buffer: Buffer.from('x') } as Express.Multer.File;
      mockService.upload.mockResolvedValue({ id: 'att-1' });

      const result = await controller.upload('ticket-1', file, mockUser as any, { visibility: 'PUBLIC' } as any);

      expect(service.upload).toHaveBeenCalledWith('ticket-1', file, 'user-1', 'Admin', 'PUBLIC');
      expect(result).toEqual({ id: 'att-1' });
    });

    it('should throw when no file provided', async () => {
      await expect(controller.upload('ticket-1', undefined as any, mockUser as any, {} as any))
        .rejects.toThrow('File is required');
    });
  });

  describe('findByTicketId()', () => {
    it('should call service.findByTicketId with pagination', async () => {
      mockService.findByTicketId.mockResolvedValue({ data: [] });

      await controller.findByTicketId('ticket-1', { page: 1, limit: 10 } as any, mockUser as any);

      expect(service.findByTicketId).toHaveBeenCalledWith('ticket-1', 'user-1', 'Admin', 1, 10);
    });
  });

  describe('download()', () => {
    it('should set headers before streaming file', async () => {
      const headers: Record<string, string> = {};
      const mockRes = {
        setHeader: jest.fn((name: string, value: string) => { headers[name] = value; }),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;
      mockService.getDownloadInfo.mockResolvedValue({
        path: '/tmp/test.pdf', originalName: 'test.pdf', mimeType: 'application/pdf',
      });

      await expect(controller.download('att-1', '0', mockUser as any, mockRes))
        .rejects.toThrow(); // fileStream.pipe fails in test, but headers are set before

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('test.pdf'));
    });
  });
});
