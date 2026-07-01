/**
 * Run an async function over an array of items with a concurrency limit.
 * Returns all settled results (successes + failures).
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  const queue = [...items];

  while (queue.length > 0) {
    const batch = queue.splice(0, Math.min(limit, queue.length));
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }

  return results;
}
