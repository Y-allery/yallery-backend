import { RATE_LIMITS } from 'src/common/constants/rate.limit.contants';
import { AiServiceToken, TokenStatus } from './entities/service-token.entity';
import { AIEnum } from 'src/common/enums/ai.enum';
import { Injectable, Logger } from '@nestjs/common';
import { LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ServiceTokenService {
  private readonly logger = new Logger(ServiceTokenService.name);
  constructor(
    @InjectRepository(AiServiceToken)
    private readonly tokenRepository: Repository<AiServiceToken>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async getNextAvailableToken(
    aiService: AIEnum,
  ): Promise<AiServiceToken | null> {
    try {
      const token = await this.tokenRepository.findOne({
        where: {
          ai_service: aiService,
          status: TokenStatus.ACTIVE,
        },
        order: { updated_at: 'ASC' },
      });

      if (!token) {
        throw new Error('No tokens available for this service');
      }

      return token;
    } catch (error) {
      console.error('Task delayed due to error:', error.message);
      throw error;
    }
  }
  async markTokenAsRateLimited(token: AiServiceToken, aiService: AIEnum) {
    const { window } = RATE_LIMITS[aiService];
    token.status = TokenStatus.RATE_LIMITED;
    token.rate_limit_reset_time = new Date(Date.now() + window * 1000);
    await this.tokenRepository.save(token);
  }

  async markTokenAsInactive(token: AiServiceToken) {
    token.status = TokenStatus.INACTIVE;
    await this.tokenRepository.save(token);
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
