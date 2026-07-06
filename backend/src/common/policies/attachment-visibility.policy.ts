import { CommentType, AttachmentVisibility } from '@prisma/client';

export type UserRole = 'EndUser' | 'ITSupport' | 'Admin';

/**
 * Centralized policy for attachment visibility.
 * All EndUser attachment filtering MUST go through this policy.
 * ITSupport/Admin see all attachments (no filtering).
 */
export class AttachmentVisibilityPolicy {
  /**
   * Returns a Prisma `where` clause for filtering visible attachments
   * for the given role. Use in ticket detail queries.
   */
  static buildVisibleAttachmentWhere(role: UserRole) {
    if (role !== 'EndUser') {
      return undefined;
    }
    return {
      AND: [
        { visibility: AttachmentVisibility.PUBLIC },
        {
          OR: [
            { commentId: null },
            { comment: { type: CommentType.PUBLIC } },
          ],
        },
      ],
    };
  }

  /**
   * Returns a Prisma `_count` where clause for visible attachments
   * for EndUser. Use in list/detail count queries.
   */
  static buildVisibleAttachmentCountWhere() {
    return {
      visibility: AttachmentVisibility.PUBLIC,
      OR: [
        { commentId: null },
        { comment: { type: CommentType.PUBLIC } },
      ],
    };
  }

  /**
   * Check if a single attachment is visible to the given role.
   * Use for download/access checks.
   */
  static isAttachmentVisible(
    attachment: {
      comment?: { type: CommentType } | null;
      visibility?: AttachmentVisibility;
    } | null,
    role: UserRole,
  ): boolean {
    if (role !== 'EndUser') return true;
    if (!attachment) return false;
    if (attachment.visibility === AttachmentVisibility.INTERNAL) return false;
    if (attachment.comment?.type === CommentType.INTERNAL) return false;
    return true;
  }
}
