/**
 * Run an async function over an array of items with a concurrency limit.
 * Uses semaphore-based scheduling: up to `limit` items run concurrently;
 * as one finishes, the next starts immediately.
 * Returns all settled results (successes + failures) in input order.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;
  const running: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      try {
        const value = await fn(items[i]);
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < workerCount; i++) {
    running.push(worker());
  }

  await Promise.all(running);
  return results;
}
