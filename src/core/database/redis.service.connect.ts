import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
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

  /**
   * Returns an owner token to pass back to releaseLock, or null if the lock is
   * held. The token is what makes release safe: a run that overruns its TTL
   * would otherwise DEL a lock its successor now holds, and the two would race
   * — each overrun cascading into the next.
   */
  async acquireLock(key: string, ttl: number = 600): Promise<string | null> {
    try {
      const token = randomUUID();
      const result = await this.client.set(key, token, { EX: ttl, NX: true });
      return result === 'OK' ? token : null;
    } catch (error) {
      console.error(`Failed to acquire lock ${key}:`, error);
      return null;
    }
  }

  async releaseLock(key: string, token?: string): Promise<void> {
    try {
      if (!token) {
        await this.client.del(key);
        return;
      }
      // Compare-and-delete: only the owner clears the key.
      await this.client.eval(
        `if redis.call('get', KEYS[1]) == ARGV[1] then
           return redis.call('del', KEYS[1])
         else
           return 0
         end`,
        { keys: [key], arguments: [token] },
      );
    } catch (error) {
      console.error(`Failed to release lock ${key}:`, error);
    }
  }
}

