import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /**
   * Checks the dependencies, not just the process. A load balancer that only
   * pings the process will keep sending traffic to a container whose database
   * has gone away.
   */
  @Get()
  async check() {
    const [database, pgvector] = await this.checkDatabase();
    const redis = await this.checkRedis();
    const ok = database && pgvector && redis;

    return {
      status: ok ? 'ok' : 'degraded',
      checks: { database, pgvector, redis },
    };
  }

  private async checkDatabase(): Promise<[boolean, boolean]> {
    try {
      const rows = await this.dataSource.query(
        `SELECT 1 AS up,
                EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector`,
      );
      return [true, rows[0]?.vector === true];
    } catch {
      return [false, false];
    }
  }

  private async checkRedis(): Promise<boolean> {
    const client = new Redis(this.config.get<string>('redis.url')!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await client.connect();
      return (await client.ping()) === 'PONG';
    } catch {
      return false;
    } finally {
      client.disconnect();
    }
  }
}
