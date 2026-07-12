import { FaqInteractionType } from '@prisma/client';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';

export const CLIENT_FAQ_INTERACTION_TYPES = [
  FaqInteractionType.RecommendationsShown,
  FaqInteractionType.ArticleOpened,
  FaqInteractionType.ProblemResolved,
] as const;

export class CreateFaqInteractionDto {
  @IsUUID()
  sessionId!: string;

  @IsIn(CLIENT_FAQ_INTERACTION_TYPES)
  eventType!: (typeof CLIENT_FAQ_INTERACTION_TYPES)[number];

  @ValidateIf((dto: CreateFaqInteractionDto) =>
    dto.faqId !== undefined ||
    dto.eventType === FaqInteractionType.ArticleOpened ||
    dto.eventType === FaqInteractionType.ProblemResolved,
  )
  @IsUUID()
  faqId?: string;

  @ValidateIf((dto: CreateFaqInteractionDto) =>
    dto.subCategoryId !== undefined ||
    dto.eventType === FaqInteractionType.RecommendationsShown,
  )
  @IsUUID()
  subCategoryId?: string;
}
