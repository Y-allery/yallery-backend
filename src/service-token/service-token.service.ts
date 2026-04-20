import { RATE_LIMITS } from 'src/common/constants/rate.limit.contants';
import { AiServiceToken, TokenStatus } from './entities/service-token.entity';
import { AIEnum, VideoAIEnum } from 'src/common/enums/ai.enum';
import { Injectable, Logger } from '@nestjs/common';
import { LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  FAL_SHARED_TOKEN_SERVICES,
  TOKEN_POOL_KEYS,
} from './constants/token-pool.constant';
const DEFAULT_WINDOW = 60;

@Injectable()
export class ServiceTokenService {
  private readonly logger = new Logger(ServiceTokenService.name);
  constructor(
    @InjectRepository(AiServiceToken)
    private readonly tokenRepository: Repository<AiServiceToken>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  private resolvePoolKey(aiService: AIEnum | VideoAIEnum | string): string {
    if (FAL_SHARED_TOKEN_SERVICES.has(aiService)) {
      return TOKEN_POOL_KEYS.FAL_SHARED;
    }

    return aiService;
  }

  async getNextAvailableToken(
    aiService: AIEnum | VideoAIEnum | string,
  ): Promise<AiServiceToken | null> {
    const poolKey = this.resolvePoolKey(aiService);

    return this.getNextAvailableTokenFromPool(poolKey, aiService);
  }

  async getNextAvailableTokenFromPool(
    poolKey: string,
    requestedService?: AIEnum | VideoAIEnum | string,
  ): Promise<AiServiceToken | null> {
    const serviceLabel = requestedService ?? poolKey;

    try {
      const tokens = await this.tokenRepository.find({
        where: {
          poolKey,
        },
        order: { updated_at: 'ASC' },
      });

      const activeTokens = tokens.filter((token) => token.status === TokenStatus.ACTIVE);
      const rateLimitedTokens = tokens.filter(
        (token) => token.status === TokenStatus.RATE_LIMITED,
      );
      const inactiveTokens = tokens.filter(
        (token) => token.status === TokenStatus.INACTIVE,
      );

      const token = activeTokens[0];

      if (!token) {
        this.logger.warn(
          `[service-token] no-active-token | requestedService=${serviceLabel} | poolKey=${poolKey} | total=${tokens.length} | active=${activeTokens.length} | rateLimited=${rateLimitedTokens.length} | inactive=${inactiveTokens.length} | states=${JSON.stringify(tokens.map((t) => ({ id: t.id, poolKey: t.poolKey, status: t.status, resetAt: t.rate_limit_reset_time })))}`,
        );
        throw new Error('No tokens available for this service');
      }

      this.logger.log(
        `[service-token] token-selected | requestedService=${serviceLabel} | poolKey=${poolKey} | tokenId=${token.id} | total=${tokens.length} | active=${activeTokens.length} | rateLimited=${rateLimitedTokens.length} | inactive=${inactiveTokens.length}`,
      );

      return token;
    } catch (error) {
      this.logger.error(
        `[service-token] get-next-token-failed | requestedService=${serviceLabel} | poolKey=${poolKey} | error="${error.message}"`,
        error.stack,
      );
      console.error('Task delayed due to error:', error.message);
      throw error;
    }
  }

  async markTokenAsRateLimited(
    token: AiServiceToken,
    aiService: AIEnum | VideoAIEnum | string,
  ) {
    const poolKey = this.resolvePoolKey(aiService);
    const rateLimit = RATE_LIMITS[aiService as AIEnum];
    const window = rateLimit?.window ?? DEFAULT_WINDOW;
    const previousStatus = token.status;

    token.status = TokenStatus.RATE_LIMITED;
    token.rate_limit_reset_time = new Date(Date.now() + window * 1000);

    await this.tokenRepository.save(token);

    this.logger.warn(
      `[service-token] token-rate-limited | requestedService=${aiService} | poolKey=${poolKey} | tokenId=${token.id} | previousStatus=${previousStatus} | windowSeconds=${window} | resetAt=${token.rate_limit_reset_time.toISOString()}`,
    );
  }

  async markTokenAsInactive(token: AiServiceToken) {
    const previousStatus = token.status;
    token.status = TokenStatus.INACTIVE;
    await this.tokenRepository.save(token);
    this.logger.warn(
      `[service-token] token-inactive | poolKey=${token.poolKey} | tokenId=${token.id} | previousStatus=${previousStatus}`,
    );
  }
  @Cron(CronExpression.EVERY_SECOND)
  async resetTokens() {
    const currentTime = new Date();

    const tokensToReset = await this.tokenRepository.find({
      where: {
        status: TokenStatus.RATE_LIMITED,
        rate_limit_reset_time: LessThan(currentTime),
      },
    });

    if (tokensToReset.length > 0) {
      for (const token of tokensToReset) {
        token.status = TokenStatus.ACTIVE;
        token.rate_limit_reset_time = null;
        await this.tokenRepository.save(token);
      }
    } else {
    }
  }
}
