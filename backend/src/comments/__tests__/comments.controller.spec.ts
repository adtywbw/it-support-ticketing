import { Test, TestingModule } from '@nestjs/testing';
import { CommentsController } from '../comments.controller';
import { CommentsService } from '../comments.service';
import { Role, CommentType } from '@prisma/client';

describe('CommentsController', () => {
  let controller: CommentsController;
  let commentsService: any;

  const mockCommentsService = {
    findByTicketId: jest.fn(),
    create: jest.fn(),
  };

  const mockUser = { id: 'user-1', email: 'test@test.com', role: Role.Admin, name: 'Test' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [
        { provide: CommentsService, useValue: mockCommentsService },
      ],
    }).compile();

    controller = module.get<CommentsController>(CommentsController);
    commentsService = module.get(CommentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByTicketId()', () => {
    it('should call commentsService.findByTicketId with ticket id, user, page, and limit', async () => {
      const query = { page: 2, limit: 10 };
      const expectedResult = { data: [], meta: { page: 2, limit: 10, total: 0, totalPages: 1 } };
      mockCommentsService.findByTicketId.mockResolvedValue(expectedResult);

      const result = await controller.findByTicketId('ticket-1', query as any, mockUser);

      expect(commentsService.findByTicketId).toHaveBeenCalledWith('ticket-1', mockUser.role, mockUser.id, 2, 10);
      expect(result).toEqual(expectedResult);
    });

    it('should use default page=1 and limit=20 when not provided', async () => {
      mockCommentsService.findByTicketId.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });

      await controller.findByTicketId('ticket-1', {} as any, mockUser);

      expect(commentsService.findByTicketId).toHaveBeenCalledWith('ticket-1', mockUser.role, mockUser.id, 1, 20);
    });
  });

  describe('create()', () => {
    it('should call commentsService.create with PUBLIC type and no files', async () => {
      const createDto = { content: 'Test comment', type: CommentType.PUBLIC };
      const createdComment = { id: 'comment-1', content: 'Test comment', type: 'PUBLIC' };
      mockCommentsService.create.mockResolvedValue(createdComment);

      const result = await controller.create('ticket-1', createDto, [], mockUser);

      expect(commentsService.create).toHaveBeenCalledWith(
        'ticket-1',
        'Test comment',
        CommentType.PUBLIC,
        [],
        mockUser.id,
        mockUser.role,
      );
      expect(result).toEqual(createdComment);
    });

    it('should call commentsService.create with INTERNAL type when specified', async () => {
      const createDto = { content: 'Internal note', type: CommentType.INTERNAL };
      const createdComment = { id: 'comment-2', content: 'Internal note', type: 'INTERNAL' };
      mockCommentsService.create.mockResolvedValue(createdComment);

      const result = await controller.create('ticket-1', createDto, [], mockUser);

      expect(commentsService.create).toHaveBeenCalledWith(
        'ticket-1',
        'Internal note',
        CommentType.INTERNAL,
        [],
        mockUser.id,
        mockUser.role,
      );
      expect(result).toEqual(createdComment);
    });

    it('should pass files array to commentsService.create', async () => {
      const createDto = { content: 'Comment with file', type: CommentType.PUBLIC };
      const fakeFile = { originalname: 'test.txt', mimetype: 'text/plain', buffer: Buffer.from('test') } as Express.Multer.File;
      const createdComment = { id: 'comment-3', content: 'Comment with file' };
      mockCommentsService.create.mockResolvedValue(createdComment);

      const result = await controller.create('ticket-1', createDto, [fakeFile], mockUser);

      expect(commentsService.create).toHaveBeenCalledWith(
        'ticket-1',
        'Comment with file',
        CommentType.PUBLIC,
        [fakeFile],
        mockUser.id,
        mockUser.role,
      );
      expect(result).toEqual(createdComment);
    });
  });
});
