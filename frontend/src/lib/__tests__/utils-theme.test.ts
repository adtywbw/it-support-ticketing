import { describe, expect, it } from 'vitest';
import { getPriorityColor, getSLAColor, getStatusColor } from '../utils';

describe('theme helper colors', () => {
  it('uses blue/navy neutral classes for closed tickets', () => {
    const color = getStatusColor('Closed');

    expect(color).toContain('bg-blue-50');
    expect(color).toContain('text-navy-700');
    expect(color).not.toContain('slate');
  });

  it('uses blue/navy neutral classes for low priority', () => {
    const color = getPriorityColor('Low');

    expect(color).toContain('bg-blue-50');
    expect(color).toContain('text-navy-700');
    expect(color).not.toContain('slate');
  });

  it('uses navy text for unknown SLA statuses', () => {
    const color = getSLAColor('Unknown');

    expect(color).toBe('text-navy-600 dark:text-blue-300');
  });
});
