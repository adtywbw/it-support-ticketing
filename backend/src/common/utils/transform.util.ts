import { TransformFnParams } from 'class-transformer';

/**
 * Trims whitespace from string values. Safe for non-string types.
 * Use with `@Transform(trimString)` in DTOs.
 *
 * @example
 * ```typescript
 * class CreateTicketDto {
 *   @Transform(trimString)
 *   @IsString()
 *   @IsNotEmpty()
 *   subject: string;
 * }
 * ```
 */
export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
