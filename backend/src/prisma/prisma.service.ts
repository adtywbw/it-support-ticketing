import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = new URL(process.env.DATABASE_URL!);
    const poolMax = process.env.DATABASE_POOL_MAX || '10';
    url.searchParams.set('connection_limit', poolMax);
    super({ datasourceUrl: url.toString() });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
