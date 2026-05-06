import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: ReturnType<typeof createClient>;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = createClient({
      socket: {
        host: this.configService.get<string>('REDIS_HOST'),
        port: this.configService.get<number>('REDIS_PORT'),
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        },
      },
      password: this.configService.get<string>('REDIS_PASSWORD'),
    });

    this.client.on('error', (err) => {
      console.error('Redis Service Error:', err);
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  getClient(): ReturnType<typeof createClient> {
    return this.client;
  }

  async acquireLock(key: string, ttl: number = 600): Promise<boolean> {
    try {
      const result = await this.client.set(key, '1', { EX: ttl, NX: true });
      return result === 'OK';
    } catch (error) {
      console.error(`Failed to acquire lock ${key}:`, error);
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`Failed to release lock ${key}:`, error);
    }
  }
}

