import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from 'src/modules/users/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.auth.strategy';
import { MailModule } from 'src/integrations/mail/mail.module';
import { NotificationPreferenceEntity } from 'src/modules/notifications/entity/notification.preferences.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { PartnerLinkModule } from 'src/modules/admin/features/partnerships/partner-link.module';
import { TwitterStrategy } from './strategies/twitter.auth.strategy';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';

@Module({
  imports: [
    PartnerLinkModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN');

        if (!expiresIn) {
          throw new Error('JWT_EXPIRES_IN is required');
        }

        return {
          secret: configService.get<string>('JWT_SECRET') || 'dev',
          signOptions: { expiresIn },
        };
      },
    }),
    UserModule,
    MailModule,
    TypeOrmModule.forFeature([UserEntity, NotificationPreferenceEntity]),
    NotificationModule,
    RewardModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TwitterStrategy],
})
export class AuthModule {}
