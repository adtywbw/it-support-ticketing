import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from '../comments.service';
import { CommentRepository } from '../../common/repositories/comment.repository';
import { AttachmentRepository } from '../../common/repositories/attachment.repository';
import { TicketRepository } from '../../common/repositories/ticket.repository';
import { StorageService, STORAGE_SERVICE } from '../../attachments/interfaces/storage-service.interface';
import { AttachmentVisibilityPolicy } from '../../common/policies/attachment-visibility.policy';
import { Role, CommentType, AttachmentVisibility } from '@prisma/client';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { appConfig } from '../../common/config/app.config';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepository: any;
  let ticketRepository: any;
  let storageService: any;

  const mockUser = { id: 'user-1', name: 'Alice' };
  const ticketId = 'ticket-1';
  const content = 'Test comment body';

  const validFile = {
    originalname: 'document.txt',
    mimetype: 'text/plain',
    size: 1000,
    buffer: Buffer.from('plain text'),
  } as Express.Multer.File;

  beforeEach(async () => {
    commentRepository = {
      findByTicketId: jest.fn(),
      countByTicketId: jest.fn(),
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
        CommentsService,
        { provide: CommentRepository, useValue: commentRepository },
        { provide: AttachmentRepository, useValue: {} },
        { provide: TicketRepository, useValue: ticketRepository },
        { provide: STORAGE_SERVICE, useValue: storageService },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockTransaction(result: Record<string, any>) {
    const mockTx = {
      comment: {
        create: jest.fn().mockResolvedValue({ id: 'comment-1' }),
        findUnique: jest.fn().mockResolvedValue(result),
      },
      attachment: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
    };
    commentRepository.transaction.mockImplementation(async (fn: any) => fn(mockTx));
    return mockTx;
  }

  function mockTicket(requesterId = 'user-1') {
    ticketRepository.findUnique.mockResolvedValue({ id: ticketId, requesterId });
  }

  describe('create()', () => {
    it('creates a PUBLIC comment successfully', async () => {
      mockTicket();
      const expected = {
        id: 'comment-1', content, type: CommentType.PUBLIC,
        user: mockUser, attachments: [],
      };
      mockTransaction(expected);

      const result = await service.create(ticketId, content, CommentType.PUBLIC, [], 'user-1', Role.Admin);

      expect(ticketRepository.findUnique).toHaveBeenCalledWith({
        where: { id: ticketId },
        select: { id: true, requesterId: true },
      });
      expect(result).toEqual(expected);
    });

    it('creates an INTERNAL comment for non-EndUser', async () => {
      mockTicket();
      const expected = {
        id: 'comment-2', content, type: CommentType.INTERNAL,
        user: mockUser, attachments: [],
      };
      mockTransaction(expected);

      const result = await service.create(ticketId, content, CommentType.INTERNAL, [], 'user-1', Role.ITSupport);

      expect(result).toEqual(expected);
    });

    it('creates a comment with attached files and sets visibility based on comment type', async () => {
      mockTicket();
      mockTransaction({
        id: 'comment-3', content, type: CommentType.INTERNAL,
        user: mockUser, attachments: [{ id: 'att-1', visibility: AttachmentVisibility.INTERNAL }],
      });
      storageService.save.mockResolvedValue(undefined);

      const result = await service.create(ticketId, content, CommentType.INTERNAL, [validFile], 'user-1', Role.Admin);

      expect(storageService.save).toHaveBeenCalledTimes(1);
      expect(result!.attachments[0].visibility).toBe(AttachmentVisibility.INTERNAL);
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      ticketRepository.findUnique.mockResolvedValue(null);

      await expect(
        service.create(ticketId, content, CommentType.PUBLIC, [], 'user-1', Role.Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when EndUser creates INTERNAL comment', async () => {
      mockTicket();

      await expect(
        service.create(ticketId, content, CommentType.INTERNAL, [], 'user-1', Role.EndUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when EndUser comments on another users ticket', async () => {
      mockTicket('other-user');

      await expect(
        service.create(ticketId, content, CommentType.PUBLIC, [], 'user-1', Role.EndUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when file count exceeds maxFilesPerComment', async () => {
      mockTicket();
      const tooMany = Array.from({ length: appConfig.fileUpload.maxFilesPerComment + 1 }, () => validFile);

      await expect(
        service.create(ticketId, content, CommentType.PUBLIC, tooMany, 'user-1', Role.Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for disallowed MIME type', async () => {
      mockTicket();
      const exeFile = { ...validFile, mimetype: 'application/x-msdos-program' };

      await expect(
        service.create(ticketId, content, CommentType.PUBLIC, [exeFile], 'user-1', Role.Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when file exceeds maxCommentFileSize', async () => {
      mockTicket();
      const oversized = { ...validFile, size: appConfig.fileUpload.maxCommentFileSize + 1 };

      await expect(
        service.create(ticketId, content, CommentType.PUBLIC, [oversized], 'user-1', Role.Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when MIME integrity check fails', async () => {
      mockTicket();
      const badIntegrity = {
        ...validFile,
        mimetype: 'text/plain',
        buffer: Buffer.from([0x00, 0xFF, 0xFE]),
      };

      await expect(
        service.create(ticketId, content, CommentType.PUBLIC, [badIntegrity], 'user-1', Role.Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when ticket max attachments is exceeded', async () => {
      mockTicket();
      commentRepository.transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          comment: { create: jest.fn(), findUnique: jest.fn() },
          attachment: {
            count: jest.fn().mockResolvedValue(appConfig.fileUpload.maxFilesPerTicket),
            create: jest.fn(),
          },
        };
        return fn(mockTx);
      });

      await expect(
        service.create(ticketId, content, CommentType.PUBLIC, [validFile], 'user-1', Role.ITSupport),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not need file cleanup when transaction rejects before file save', async () => {
      mockTicket();
      storageService.save.mockResolvedValue(undefined);
      commentRepository.transaction.mockRejectedValue(new Error('DB failure'));

      await expect(
        service.create(ticketId, content, CommentType.PUBLIC, [validFile], 'user-1', Role.Admin),
      ).rejects.toThrow('DB failure');

      // Files are saved INSIDE the transaction callback now, so if the
      // transaction mock rejects immediately, no files were saved.
      expect(storageService.delete).not.toHaveBeenCalled();
    });

    it('does not assert MIME integrity when file has no buffer', async () => {
      mockTicket();
      const noBufferFile = {
        ...validFile,
        buffer: undefined,
        mimetype: 'text/plain',
      } as any;
      mockTransaction({
        id: 'comment-4', content, type: CommentType.PUBLIC,
        user: mockUser, attachments: [],
      });
      storageService.save.mockResolvedValue(undefined);

      const result = await service.create(ticketId, content, CommentType.PUBLIC, [noBufferFile], 'user-1', Role.Admin);

      expect(result).toBeDefined();
    });
  });

  describe('findByTicketId()', () => {
    const comments = [{ id: 'c1', content: 'First comment' }];

    beforeEach(() => {
      jest.spyOn(AttachmentVisibilityPolicy, 'buildVisibleAttachmentWhere').mockReturnValue(undefined);
    });

    it('returns paginated comments for Admin', async () => {
      mockTicket('other-user');
      commentRepository.findByTicketId.mockResolvedValue(comments);
      commentRepository.countByTicketId.mockResolvedValue(1);

      const result = await service.findByTicketId(ticketId, Role.Admin, 'user-2', 1, 20);

      expect(commentRepository.findByTicketId).toHaveBeenCalledWith(
        ticketId, { ticketId }, { skip: 0, take: 20 }, undefined,
      );
      expect(result).toEqual({
        data: comments,
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it('filters PUBLIC type and applies visibility for EndUser', async () => {
      mockTicket('user-1');
      const visibilityWhere = {
        AND: [
          { visibility: 'PUBLIC' as const },
          { OR: [{ commentId: null }, { comment: { type: 'PUBLIC' as const } }] },
        ],
      };
      jest.spyOn(AttachmentVisibilityPolicy, 'buildVisibleAttachmentWhere').mockReturnValue(visibilityWhere);
      commentRepository.findByTicketId.mockResolvedValue(comments);
      commentRepository.countByTicketId.mockResolvedValue(1);

      await service.findByTicketId(ticketId, Role.EndUser, 'user-1', 1, 10);

      expect(commentRepository.findByTicketId).toHaveBeenCalledWith(
        ticketId,
        { ticketId, type: CommentType.PUBLIC },
        { skip: 0, take: 10 },
        expect.objectContaining({
          attachments: expect.objectContaining({ where: visibilityWhere }),
        }),
      );
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      ticketRepository.findUnique.mockResolvedValue(null);

      await expect(
        service.findByTicketId(ticketId, Role.Admin, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when EndUser accesses another ticket', async () => {
      mockTicket('other-user');

      await expect(
        service.findByTicketId(ticketId, Role.EndUser, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('normalizes invalid page and limit to defaults', async () => {
      mockTicket('user-1');
      commentRepository.findByTicketId.mockResolvedValue([]);
      commentRepository.countByTicketId.mockResolvedValue(0);

      await service.findByTicketId(ticketId, Role.Admin, 'user-1', -1, -5);

      expect(commentRepository.findByTicketId).toHaveBeenCalledWith(
        ticketId, { ticketId }, { skip: 0, take: 20 }, undefined,
      );
    });

    it('caps limit at 100', async () => {
      mockTicket('user-1');
      commentRepository.findByTicketId.mockResolvedValue([]);
      commentRepository.countByTicketId.mockResolvedValue(0);

      await service.findByTicketId(ticketId, Role.Admin, 'user-1', 1, 500);

      expect(commentRepository.findByTicketId).toHaveBeenCalledWith(
        ticketId, { ticketId }, { skip: 0, take: 100 }, undefined,
      );
    });
  });
});
