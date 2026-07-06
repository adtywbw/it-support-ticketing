import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

const mockRedisClient = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  exists: jest.fn(),
  ping: jest.fn(),
  eval: jest.fn(),
  scan: jest.fn(),
  mget: jest.fn(),
  quit: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();
    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_PASSWORD;
  });

  it('set stores value with TTL', async () => {
    await service.set('key', 'value', 60);
    expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'value', 'EX', 60);
  });

  it('set stores value without TTL', async () => {
    await service.set('key', 'value');
    expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'value');
  });

  it('get returns value', async () => {
    mockRedisClient.get.mockResolvedValue('value');
    expect(await service.get('key')).toBe('value');
  });

  it('get returns null for missing key', async () => {
    mockRedisClient.get.mockResolvedValue(null);
    expect(await service.get('missing')).toBeNull();
  });

  it('setNx returns true when acquired', async () => {
    mockRedisClient.set.mockResolvedValue('OK');
    expect(await service.setNx('lock', 'token', 10)).toBe(true);
  });

  it('setNx returns false when not acquired', async () => {
    mockRedisClient.set.mockResolvedValue(null);
    expect(await service.setNx('lock', 'token', 10)).toBe(false);
  });

  it('del deletes key', async () => {
    await service.del('key');
    expect(mockRedisClient.del).toHaveBeenCalledWith('key');
  });

  it('incr increments', async () => {
    mockRedisClient.incr.mockResolvedValue(5);
    expect(await service.incr('counter')).toBe(5);
  });

  it('expire sets TTL', async () => {
    await service.expire('key', 60);
    expect(mockRedisClient.expire).toHaveBeenCalledWith('key', 60);
  });

  it('eval executes Lua script', async () => {
    mockRedisClient.eval.mockResolvedValue('result');
    const script = 'return KEYS[1]';
    expect(await service.eval(script, ['k1'], ['a1'])).toBe('result');
    expect(mockRedisClient.eval).toHaveBeenCalledWith(script, 1, 'k1', 'a1');
  });

  it('ping returns true on PONG', async () => {
    mockRedisClient.ping.mockResolvedValue('PONG');
    expect(await service.ping()).toBe(true);
  });

  it('ping returns false on error', async () => {
    mockRedisClient.ping.mockRejectedValue(new Error('timeout'));
    expect(await service.ping()).toBe(false);
  });

  it('exists returns true when key exists', async () => {
    mockRedisClient.exists.mockResolvedValue(1);
    expect(await service.exists('key')).toBe(true);
  });

  it('mget returns values', async () => {
    mockRedisClient.mget.mockResolvedValue(['v1', 'v2']);
    expect(await service.mget(['k1', 'k2'])).toEqual(['v1', 'v2']);
  });

  it('mget returns empty array for no keys', async () => {
    expect(await service.mget([])).toEqual([]);
  });

  it('deleteByPattern scans and deletes', async () => {
    mockRedisClient.scan
      .mockResolvedValueOnce(['0', ['k1', 'k2']]);
    mockRedisClient.del.mockResolvedValue(2);
    expect(await service.deleteByPattern('test:*')).toBe(2);
  });

  it('onModuleDestroy quits', async () => {
    await service.onModuleDestroy();
    expect(mockRedisClient.quit).toHaveBeenCalled();
  });
});
