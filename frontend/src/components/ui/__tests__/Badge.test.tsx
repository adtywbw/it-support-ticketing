import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../Badge';

describe('Badge', () => {
  it('uses blue/navy neutral classes for the default variant', () => {
    render(<Badge>Neutral</Badge>);

    const badge = screen.getByText('Neutral');
    expect(badge.className).toContain('bg-blue-50');
    expect(badge.className).toContain('text-navy-700');
    expect(badge.className).not.toContain('slate');
  });
});
