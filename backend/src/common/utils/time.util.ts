/**
 * Parse a duration string like "7d" or "15m" to milliseconds.
 * Supports s (seconds), m (minutes), h (hours), d (days).
 * Falls back to 7 days if the string is unparseable.
 */
export function parseExpiryToMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * (multipliers[unit] || multipliers.d);
}
