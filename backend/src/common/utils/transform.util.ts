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

/**
 * Trims whitespace from optional string values.
 * Returns `undefined` when the trimmed result is empty (falsy),
 * allowing `@IsOptional()` to skip validation on blank strings.
 */
export const trimOptionalString = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};
