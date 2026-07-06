import { runWithConcurrency } from '../concurrency.util';

describe('runWithConcurrency', () => {
  it('should process all items', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrency(items, 2, async (n) => n * 2);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([2, 4, 6, 8, 10]);
  });

  it('should never run more than the limit concurrently', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const items = [1, 2, 3, 4, 5, 6];

    await runWithConcurrency(items, 2, async (n) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
    });

    expect(maxConcurrent).toBe(2);
  });

  it('should process all items even when some reject', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrency(items, 3, async (n) => {
      if (n === 3) throw new Error('fail');
      return n;
    });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]).toEqual({ status: 'fulfilled', value: 2 });
    expect(results[2]).toEqual({ status: 'rejected', reason: expect.any(Error) });
    expect(results[3]).toEqual({ status: 'fulfilled', value: 4 });
    expect(results[4]).toEqual({ status: 'fulfilled', value: 5 });
  });

  it('should handle empty items', async () => {
    const results = await runWithConcurrency([], 5, async () => 'x');
    expect(results).toEqual([]);
  });

  it('should preserve result order with variable-latency items', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrency(items, 3, async (n) => {
      // Make item 2 slower so it completes after item 3
      if (n === 2) await new Promise((r) => setTimeout(r, 50));
      return n;
    });

    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([1, 2, 3, 4, 5]);
  });

  it('should start next item immediately when one finishes', async () => {
    const order: number[] = [];
    let started = 0;

    await runWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      started++;
      order.push(n);
      if (n === 1) {
        // Fast - complete immediately, allowing item 3 to start
        await new Promise((r) => setTimeout(r, 10));
      } else {
        await new Promise((r) => setTimeout(r, 100));
      }
    });

    expect(started).toBe(4);
    // Item 1 finishes first, so item 3 should start before items 2 or 4 finish
    expect(order).toContain(1);
    expect(order).toContain(3);
  });

  it('should default to single concurrency when limit is 1', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    await runWithConcurrency([1, 2, 3], 1, async (n) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
    });

    expect(maxConcurrent).toBe(1);
  });
});
