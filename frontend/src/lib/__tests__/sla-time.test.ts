import { describe, expect, it } from 'vitest';
import {
  formatSLADuration,
  isValidSLAWindow,
  splitMinutesForInput,
  toMinutes,
} from '../sla-time';

describe('sla-time helpers', () => {
  it('should convert user-friendly values to minutes', () => {
    expect(toMinutes(30, 'minutes')).toBe(30);
    expect(toMinutes(4, 'hours')).toBe(240);
    expect(toMinutes(2, 'days')).toBe(2880);
  });

  it('should split stored minutes into the largest exact user-friendly unit', () => {
    expect(splitMinutesForInput(2880)).toEqual({ value: 2, unit: 'days' });
    expect(splitMinutesForInput(240)).toEqual({ value: 4, unit: 'hours' });
    expect(splitMinutesForInput(45)).toEqual({ value: 45, unit: 'minutes' });
  });

  it('should format stored minutes for table display', () => {
    expect(formatSLADuration(1)).toBe('1 minute');
    expect(formatSLADuration(90)).toBe('90 minutes');
    expect(formatSLADuration(60)).toBe('1 hour');
    expect(formatSLADuration(120)).toBe('2 hours');
    expect(formatSLADuration(1440)).toBe('1 day');
    expect(formatSLADuration(2880)).toBe('2 days');
  });

  it('should validate SLA response and resolution windows', () => {
    expect(isValidSLAWindow(60, 60)).toBe(true);
    expect(isValidSLAWindow(60, 240)).toBe(true);
    expect(isValidSLAWindow(240, 60)).toBe(false);
    expect(isValidSLAWindow(0, 60)).toBe(false);
    expect(isValidSLAWindow(60, 0)).toBe(false);
  });
});
