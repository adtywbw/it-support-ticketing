import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsService } from './attachments.service';
import { AttachmentRepository } from '../common/repositories/attachment.repository';
import { TicketRepository } from '../common/repositories/ticket.repository';
import { StorageService, STORAGE_SERVICE } from './interfaces/storage-service.interface';
import { AttachmentVisibilityPolicy } from '../common/policies/attachment-visibility.policy';
import { Role, AttachmentVisibility } from '@prisma/client';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { appConfig } from '../common/config/app.config';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let attachmentRepository: any;
  let ticketRepository: any;
  let storageService: any;

  const ticketId = 'ticket-1';

  const validFile = {
    originalname: 'report.pdf',
    mimetype: 'application/pdf',
    size: 50000,
    buffer: Buffer.from('%PDF-1.4 test'),
  } as Express.Multer.File;

  beforeEach(async () => {
    attachmentRepository = {
      findByTicketId: jest.fn(),
      findById: jest.fn(),
      count: jest.fn(),
      transaction: jest.fn(),
    };
    ticketRepository = {
      findUnique: jest.fn(),
    };
    storageService = {
      save: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: AttachmentRepository, useValue: attachmentRepository },
        { provide: TicketRepository, useValue: ticketRepository },
        { provide: STORAGE_SERVICE, useValue: storageService },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockTicket(requesterId = 'user-1') {
    ticketRepository.findUnique.mockResolvedValue({ id: ticketId, requesterId });
  }

  function mockTransaction(returnValue: any) {
    const mockTx = {
      attachment: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(returnValue),
      },
    };
    attachmentRepository.transaction.mockImplementation(async (fn: any) => fn(mockTx));
    return mockTx;
  }

  describe('upload()', () => {
    it('uploads a file with PUBLIC visibility for Admin', async () => {
      mockTicket();
      const created = {
        id: 'att-1', originalName: 'report.pdf', mimeType: 'application/pdf',
        size: 50000, visibility: AttachmentVisibility.PUBLIC, user: { id: 'user-1', name: 'Alice' },
      };
      mockTransaction(created);

      const result = await service.upload(ticketId, validFile, 'user-1', Role.Admin);

      expect(storageService.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(created);
    });

    it('uploads a file with INTERNAL visibility for Admin when specified', async () => {
      mockTicket();
      const created = {
        id: 'att-2', visibility: AttachmentVisibility.INTERNAL, user: { id: 'user-1', name: 'Alice' },
      };
      mockTransaction(created);

      const result = await service.upload(ticketId, validFile, 'user-1', Role.Admin, AttachmentVisibility.INTERNAL);

      expect(result.visibility).toBe(AttachmentVisibility.INTERNAL);
    });

    it('forces PUBLIC visibility for EndUser even when INTERNAL is requested', async () => {
      mockTicket('enduser-1');
      const created = {
        id: 'att-3', visibility: AttachmentVisibility.PUBLIC, user: { id: 'enduser-1', name: 'Bob' },
      };
      mockTransaction(created);

      const result = await service.upload(ticketId, validFile, 'enduser-1', Role.EndUser, AttachmentVisibility.INTERNAL);

      expect(result).toBeDefined();
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      ticketRepository.findUnique.mockResolvedValue(null);

      await expect(
        service.upload(ticketId, validFile, 'user-1', Role.Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when EndUser uploads to another ticket', async () => {
      mockTicket('other-user');

      await expect(
        service.upload(ticketId, validFile, 'user-1', Role.EndUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException for disallowed MIME type', async () => {
      mockTicket();
      const badFile = { ...validFile, mimetype: 'application/x-msdownload' };

      await expect(
        service.upload(ticketId, badFile, 'user-1', Role.Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when file exceeds maxDirectFileSize', async () => {
      mockTicket();
      const oversized = { ...validFile, size: appConfig.fileUpload.maxDirectFileSize + 1 };

      await expect(
        service.upload(ticketId, oversized, 'user-1', Role.Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when MIME integrity check fails', async () => {
      mockTicket();
      const mismatched = {
        ...validFile,
        mimetype: 'image/png',
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
      };

      await expect(
        service.upload(ticketId, mismatched, 'user-1', Role.Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when ticket max attachments is exceeded', async () => {
      mockTicket();
      attachmentRepository.transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          attachment: {
            count: jest.fn().mockResolvedValue(appConfig.fileUpload.maxFilesPerTicket),
            create: jest.fn(),
          },
        };
        return fn(mockTx);
      });

      await expect(
        service.upload(ticketId, validFile, 'user-1', Role.ITSupport),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes the saved file when transaction fails', async () => {
      mockTicket();
      storageService.save.mockResolvedValue(undefined);
      attachmentRepository.transaction.mockRejectedValue(new Error('TX error'));

      await expect(
        service.upload(ticketId, validFile, 'user-1', Role.Admin),
      ).rejects.toThrow('TX error');

      expect(storageService.delete).toHaveBeenCalledTimes(1);
    });

    it('does not assert MIME integrity when file has no buffer', async () => {
      mockTicket();
      const noBufferFile = { ...validFile, buffer: undefined } as any;
      const created = { id: 'att-4', user: { id: 'user-1', name: 'Alice' } };
      mockTransaction(created);
      storageService.save.mockResolvedValue(undefined);

      const result = await service.upload(ticketId, noBufferFile, 'user-1', Role.Admin);

      expect(result).toBeDefined();
    });
  });

  describe('findByTicketId()', () => {
    const attachments = [{ id: 'att-1', originalName: 'file.pdf' }];

    it('returns paginated attachments for Admin', async () => {
      mockTicket('other-user');
      attachmentRepository.findByTicketId.mockResolvedValue(attachments);
      attachmentRepository.count.mockResolvedValue(1);
      jest.spyOn(AttachmentVisibilityPolicy, 'buildVisibleAttachmentWhere').mockReturnValue(undefined);

      const result = await service.findByTicketId(ticketId, 'user-2', Role.Admin, 1, 20);

      expect(attachmentRepository.findByTicketId).toHaveBeenCalledWith(ticketId, expect.objectContaining({
        where: { ticketId },
        skip: 0,
        take: 20,
      }));
      expect(result).toEqual({
        data: attachments,
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it('applies visibility filter for EndUser', async () => {
      mockTicket('user-1');
      const visibilityWhere = {
        AND: [
          { visibility: AttachmentVisibility.PUBLIC },
          { OR: [{ commentId: null }, { comment: { type: 'PUBLIC' as const } }] },
        ],
      };
      jest.spyOn(AttachmentVisibilityPolicy, 'buildVisibleAttachmentWhere').mockReturnValue(visibilityWhere);
      attachmentRepository.findByTicketId.mockResolvedValue(attachments);
      attachmentRepository.count.mockResolvedValue(1);

      await service.findByTicketId(ticketId, 'user-1', Role.EndUser, 1, 10);

      expect(attachmentRepository.findByTicketId).toHaveBeenCalledWith(ticketId, expect.objectContaining({
        where: { ticketId, ...visibilityWhere },
      }));
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      ticketRepository.findUnique.mockResolvedValue(null);

      await expect(
        service.findByTicketId(ticketId, 'user-1', Role.Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when EndUser accesses another ticket', async () => {
      mockTicket('other-user');

      await expect(
        service.findByTicketId(ticketId, 'user-1', Role.EndUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('normalizes invalid page and limit defaults', async () => {
      mockTicket('user-1');
      jest.spyOn(AttachmentVisibilityPolicy, 'buildVisibleAttachmentWhere').mockReturnValue(undefined);
      attachmentRepository.findByTicketId.mockResolvedValue([]);
      attachmentRepository.count.mockResolvedValue(0);

      await service.findByTicketId(ticketId, 'user-1', Role.Admin, -1, -5);

      expect(attachmentRepository.findByTicketId).toHaveBeenCalledWith(ticketId, expect.objectContaining({
        skip: 0,
        take: 20,
      }));
    });
  });

  describe('getDownloadInfo()', () => {
    const attachmentId = 'att-1';

    it('returns attachment for Admin', async () => {
      const attachment = {
        id: attachmentId,
        ticket: { requesterId: 'user-2' },
        comment: { type: 'PUBLIC' },
        visibility: AttachmentVisibility.PUBLIC,
      };
      attachmentRepository.findById.mockResolvedValue(attachment);

      const result = await service.getDownloadInfo(attachmentId, 'user-1', Role.Admin);

      expect(result).toEqual(attachment);
    });

    it('returns attachment for EndUser on own visible file', async () => {
      const attachment = {
        id: attachmentId,
        ticket: { requesterId: 'user-1' },
        comment: null,
        visibility: AttachmentVisibility.PUBLIC,
      };
      attachmentRepository.findById.mockResolvedValue(attachment);

      const result = await service.getDownloadInfo(attachmentId, 'user-1', Role.EndUser);

      expect(result).toEqual(attachment);
    });

    it('throws NotFoundException when attachment does not exist', async () => {
      attachmentRepository.findById.mockResolvedValue(null);

      await expect(
        service.getDownloadInfo(attachmentId, 'user-1', Role.Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when EndUser accesses another ticket attachment', async () => {
      const attachment = {
        id: attachmentId,
        ticket: { requesterId: 'other-user' },
        comment: null,
        visibility: AttachmentVisibility.PUBLIC,
      };
      attachmentRepository.findById.mockResolvedValue(attachment);

      await expect(
        service.getDownloadInfo(attachmentId, 'user-1', Role.EndUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when EndUser accesses INTERNAL attachment', async () => {
      const attachment = {
        id: attachmentId,
        ticket: { requesterId: 'user-1' },
        comment: { type: 'INTERNAL' },
        visibility: AttachmentVisibility.INTERNAL,
      };
      attachmentRepository.findById.mockResolvedValue(attachment);

      await expect(
        service.getDownloadInfo(attachmentId, 'user-1', Role.EndUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
