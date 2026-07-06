import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.DATABASE_POOL_MAX = '5';
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_POOL_MAX;
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => new PrismaService()).toThrow('DATABASE_URL is missing or empty');
  });

  it('throws when DATABASE_URL is empty', () => {
    process.env.DATABASE_URL = '';
    expect(() => new PrismaService()).toThrow('DATABASE_URL is missing or empty');
  });

  it('throws when DATABASE_URL is invalid', () => {
    process.env.DATABASE_URL = 'not-a-url';
    expect(() => new PrismaService()).toThrow('DATABASE_URL is not a valid URL');
  });

  it('constructs with valid URL and pool max', () => {
    const service = new PrismaService();
    expect(service).toBeDefined();
  });

  it('constructs with default pool max when not set', () => {
    delete process.env.DATABASE_POOL_MAX;
    const service = new PrismaService();
    expect(service).toBeDefined();
  });
});
