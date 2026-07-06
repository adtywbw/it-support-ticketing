import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    const tlsEnabled = process.env.REDIS_TLS === 'true';
    let url = process.env.REDIS_URL;
    if (url) {
      const parsedUrl = new URL(url);
      if (process.env.REDIS_PASSWORD && !parsedUrl.password) {
        parsedUrl.password = process.env.REDIS_PASSWORD;
        url = parsedUrl.toString();
      }
      this.client = new Redis(url, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        ...(tlsEnabled ? { tls: {} } : {}),
      });
    } else {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        ...(tlsEnabled ? { tls: {} } : {}),
      });
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.set(key, value, 'EX', ttl);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.error(`Redis SET failed for key ${key}: ${err}`);
      throw err;
    }
  }

  async setNx(key: string, value: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.error(`Redis SETNX failed for key ${key}: ${err}`);
      throw err;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return this.client.get(key);
    } catch (err) {
      this.logger.error(`Redis GET failed for key ${key}: ${err}`);
      throw err;
    }
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    try {
      return this.client.mget(keys);
    } catch (err) {
      this.logger.error(`Redis MGET failed for ${keys.length} keys: ${err}`);
      throw err;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.error(`Redis DEL failed for key ${key}: ${err}`);
      throw err;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return this.client.incr(key);
    } catch (err) {
      this.logger.error(`Redis INCR failed for key ${key}: ${err}`);
      throw err;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (err) {
      this.logger.error(`Redis EXPIRE failed for key ${key}: ${err}`);
      throw err;
    }
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    try {
      return this.client.eval(script, keys.length, ...keys, ...args);
    } catch (err) {
      this.logger.error(`Redis EVAL failed: ${err}`);
      throw err;
    }
  }

  async deleteByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    try {
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          deleted += await this.client.del(keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.error(`Redis deleteByPattern failed for pattern ${pattern}: ${err}`);
      throw err;
    }
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err) {
      this.logger.error(`Redis EXISTS failed for key ${key}: ${err}`);
      throw err;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
