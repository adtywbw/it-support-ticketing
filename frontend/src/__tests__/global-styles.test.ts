import { describe, expect, it } from 'vitest';
import indexCss from '../index.css?raw';

describe('global component styles', () => {
  it('defines card-body spacing for dashboard and ticket cards', () => {
    expect(indexCss).toMatch(/\.card-body\s*\{/);
    expect(indexCss).toContain('@apply p-6;');
  });
});
