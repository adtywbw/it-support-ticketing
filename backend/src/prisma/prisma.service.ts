import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl || rawUrl.trim() === "") {
      throw new Error("DATABASE_URL is missing or empty");
    }
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error(`DATABASE_URL is not a valid URL: ${rawUrl}`);
    }
    const poolMax = process.env.DATABASE_POOL_MAX || "10";
    const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || "10"; // seconds
    url.searchParams.set("connection_limit", poolMax);
    url.searchParams.set("pool_timeout", poolTimeout);
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
