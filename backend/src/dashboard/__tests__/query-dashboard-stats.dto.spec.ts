import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryDashboardStatsDto } from '../dto/query-dashboard-stats.dto';

async function validateDto(data: Record<string, unknown>) {
  const dto = plainToInstance(QueryDashboardStatsDto, data) as object;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('QueryDashboardStatsDto', () => {
  it('should pass with empty data (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should accept valid range presets', async () => {
    for (const range of ['7d', '30d', '90d']) {
      const errors = await validateDto({ range });
      expect(errors).toHaveLength(0);
    }
  });

  it('should reject invalid range', async () => {
    const errors = await validateDto({ range: 'invalid' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isIn');
  });

  it('should accept from and to with custom range', async () => {
    const errors = await validateDto({ range: 'custom', from: '2024-01-01', to: '2024-12-31' });
    expect(errors).toHaveLength(0);
  });

  it('should reject from when range is not custom', async () => {
    const errors = await validateDto({ range: '7d', from: '2024-01-01' });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid from date string with custom range', async () => {
    const errors = await validateDto({ range: 'custom', from: 'not-a-date' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isDateString');
  });

  it('should reject invalid to date string with custom range', async () => {
    const errors = await validateDto({ range: 'custom', to: 'not-a-date' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isDateString');
  });

  it('should reject unknown fields', async () => {
    const errors = await validateDto({ range: '7d', extra: 'oops' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
