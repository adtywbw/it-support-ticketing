export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Builds a pagination meta object consistent with the API response contract.
 * `totalPages` is always at least 1 (even when `total === 0`).
 * `limit` must be > 0; if 0 is passed, `page` and `totalPages` fall back to 1.
 */
export function buildPaginationMeta(
  total: number,
  limit: number,
  page: number,
): PaginationMeta {
  if (limit <= 0) {
    return { page: 1, limit, total, totalPages: 1 };
  }
  const totalPages = Math.ceil(total / limit) || 1;
  return { page, limit, total, totalPages };
}
