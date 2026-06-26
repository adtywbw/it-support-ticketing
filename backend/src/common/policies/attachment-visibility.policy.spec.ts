import { CommentType, AttachmentVisibility } from '@prisma/client';
import { AttachmentVisibilityPolicy, UserRole } from './attachment-visibility.policy';

describe('AttachmentVisibilityPolicy', () => {
  describe('buildVisibleAttachmentWhere', () => {
    it('should return undefined for ITSupport role', () => {
      const result = AttachmentVisibilityPolicy.buildVisibleAttachmentWhere('ITSupport');
      expect(result).toBeUndefined();
    });

    it('should return undefined for Admin role', () => {
      const result = AttachmentVisibilityPolicy.buildVisibleAttachmentWhere('Admin');
      expect(result).toBeUndefined();
    });

    it('should return visibility=PUBLIC filter for EndUser', () => {
      const result = AttachmentVisibilityPolicy.buildVisibleAttachmentWhere('EndUser');
      expect(result).toEqual({
        AND: [
          { visibility: AttachmentVisibility.PUBLIC },
          {
            OR: [
              { commentId: null },
              { comment: { type: CommentType.PUBLIC } },
            ],
          },
        ],
      });
    });
  });

  describe('buildVisibleAttachmentCountWhere', () => {
    it('should return filter requiring PUBLIC visibility', () => {
      const result = AttachmentVisibilityPolicy.buildVisibleAttachmentCountWhere();
      expect(result).toEqual({
        visibility: AttachmentVisibility.PUBLIC,
        OR: [
          { commentId: null },
          { comment: { type: CommentType.PUBLIC } },
        ],
      });
    });
  });

  describe('isAttachmentVisible', () => {
    const publicDirectAttachment = {
      commentId: null,
      comment: null,
      visibility: AttachmentVisibility.PUBLIC,
    };

    const internalDirectAttachment = {
      commentId: null,
      comment: null,
      visibility: AttachmentVisibility.INTERNAL,
    };

    const publicCommentAttachment = {
      commentId: 'comment-1',
      comment: { type: CommentType.PUBLIC },
      visibility: AttachmentVisibility.PUBLIC,
    };

    const internalCommentAttachment = {
      commentId: 'comment-1',
      comment: { type: CommentType.INTERNAL },
      visibility: AttachmentVisibility.PUBLIC,
    };

    const internalCommentInternalVisibility = {
      commentId: 'comment-1',
      comment: { type: CommentType.INTERNAL },
      visibility: AttachmentVisibility.INTERNAL,
    };

    it('should allow ITSupport to see all attachments', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(publicDirectAttachment, 'ITSupport')).toBe(true);
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalDirectAttachment, 'ITSupport')).toBe(true);
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalCommentAttachment, 'ITSupport')).toBe(true);
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalCommentInternalVisibility, 'ITSupport')).toBe(true);
    });

    it('should allow Admin to see all attachments', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(publicDirectAttachment, 'Admin')).toBe(true);
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalDirectAttachment, 'Admin')).toBe(true);
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalCommentAttachment, 'Admin')).toBe(true);
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalCommentInternalVisibility, 'Admin')).toBe(true);
    });

    it('should allow EndUser to see public direct attachments', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(publicDirectAttachment, 'EndUser')).toBe(true);
    });

    it('should hide INTERNAL direct attachments from EndUser', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalDirectAttachment, 'EndUser')).toBe(false);
    });

    it('should allow EndUser to see PUBLIC comment attachments', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(publicCommentAttachment, 'EndUser')).toBe(true);
    });

    it('should hide INTERNAL comment attachments from EndUser', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalCommentAttachment, 'EndUser')).toBe(false);
    });

    it('should hide internal-comment + internal-visibility from EndUser', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalCommentInternalVisibility, 'EndUser')).toBe(false);
    });

    it('should hide null attachment from EndUser', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(null, 'EndUser')).toBe(false);
    });

    it('should allow EndUser to see PUBLIC attachments on PUBLIC comments', () => {
      const publicCommentPublicVisibility = {
        commentId: 'comment-2',
        comment: { type: CommentType.PUBLIC },
        visibility: AttachmentVisibility.PUBLIC,
      };
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(publicCommentPublicVisibility, 'EndUser')).toBe(true);
    });

    it('should hide INTERNAL attachments even on PUBLIC comments from EndUser', () => {
      const publicCommentInternalVisibility = {
        commentId: 'comment-3',
        comment: { type: CommentType.PUBLIC },
        visibility: AttachmentVisibility.INTERNAL,
      };
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(publicCommentInternalVisibility, 'EndUser')).toBe(false);
    });

    it('should hide PUBLIC attachments on INTERNAL comments from EndUser (ATT-01 regression)', () => {
      const internalCommentPublicVisibility = {
        commentId: 'comment-4',
        comment: { type: CommentType.INTERNAL },
        visibility: AttachmentVisibility.PUBLIC,
      };
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalCommentPublicVisibility, 'EndUser')).toBe(false);
    });

    it('should allow ITSupport to see PUBLIC attachments on INTERNAL comments', () => {
      const internalCommentPublicVisibility = {
        commentId: 'comment-5',
        comment: { type: CommentType.INTERNAL },
        visibility: AttachmentVisibility.PUBLIC,
      };
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(internalCommentPublicVisibility, 'ITSupport')).toBe(true);
    });

    it('should allow ITSupport/Admin to see any attachment (including null)', () => {
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(null, 'ITSupport')).toBe(true);
      expect(AttachmentVisibilityPolicy.isAttachmentVisible(null, 'Admin')).toBe(true);
    });
  });
});
