const DEFAULT_CORS_ORIGIN = 'https://helpdesk.rsmch.internal';

export function getCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function validateStartupEnv(env: NodeJS.ProcessEnv = process.env): void {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'REDIS_URL'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (env.NODE_ENV?.toLowerCase() === 'production') {
    const jwtSecret = env.JWT_SECRET || '';
    const weakSecrets = [
      'your-super-secret-jwt-key-change-in-production',
      'change-this-to-random-secret',
      'secret',
      'changeme',
      'password',
    ];
    if (weakSecrets.includes(jwtSecret.toLowerCase().trim())) {
      // Also check normalized (stripped of non-alphanumeric chars) to catch
      // variants like "Change-This-To-Random-Secret" vs "changethistorandomsecret".
      const normalized = jwtSecret.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (weakSecrets.some((s) => normalized === s.replace(/[^a-z0-9]/g, ''))) {
        throw new Error(
          'JWT_SECRET is too weak for production. Please set a strong, unique secret.',
        );
      }
    }
    if (jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must be at least 32 characters in production.',
      );
    }
    if (!env.REDIS_PASSWORD) {
      throw new Error('REDIS_PASSWORD is required in production.');
    }
    if (env.COOKIE_SECURE !== 'true') {
      throw new Error(
        'COOKIE_SECURE must be "true" in production. Set to "false" only for local HTTP development.',
      );
    }

    const insecureOrigins = getCorsOrigins(env).filter(
      (origin) => !origin.startsWith('https://'),
    );
    if (insecureOrigins.length > 0) {
      throw new Error(
        `CORS_ORIGIN must use https:// in production. Invalid origins: ${insecureOrigins.join(', ')}`,
      );
    }
  }
}
