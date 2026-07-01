import { getCorsOrigins, validateStartupEnv } from '../env-validation.util';

describe('env-validation.util', () => {
  const baseEnv = {
    JWT_SECRET: 'strong-production-secret-value-1234567890',
    DATABASE_URL: 'postgresql://user:pass@db:5432/app',
    REDIS_URL: 'redis://:pass@cache:6379',
    REDIS_PASSWORD: 'redis-pass',
    COOKIE_SECURE: 'true',
  } as NodeJS.ProcessEnv;

  it('should parse comma-separated CORS origins and drop empty entries', () => {
    expect(getCorsOrigins({ CORS_ORIGIN: ' https://a.test,https://b.test, ' } as NodeJS.ProcessEnv)).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('should default CORS origin to the internal helpdesk HTTPS origin', () => {
    expect(getCorsOrigins({} as NodeJS.ProcessEnv)).toEqual(['https://helpdesk.rsmch.internal']);
  });

  it('should reject HTTP CORS origins in production', () => {
    expect(() => validateStartupEnv({
      ...baseEnv,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://helpdesk.rsmch.internal,http://evil.test',
    })).toThrow('CORS_ORIGIN must use https:// in production');
  });

  it('should allow HTTP CORS origins outside production for local Docker development', () => {
    expect(() => validateStartupEnv({
      ...baseEnv,
      NODE_ENV: 'development',
      COOKIE_SECURE: 'false',
      CORS_ORIGIN: 'http://helpdesk.rsmch.internal',
    })).not.toThrow();
  });
});
