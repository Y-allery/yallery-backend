import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from 'src/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/user/entities/user.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.auth.strategy';
import { MailModule } from 'src/mail/mail.module';
import { GoogleStrategy } from './strategies/google.auth.strategy';
import { AppleStrategy } from './strategies/apple.auth.strategy';
import { NotificationPreferenceEntity } from 'src/notification/entity/notification.preferences.entity';
import { PartnershipEntity } from 'src/admin/entities/partner.entity';
import { PartnerUserLinkEntity } from 'src/admin/entities/partner-user-link.entity';
import { PartnershipActivityEntity } from 'src/admin/entities/partnership-activity.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { TwitterStrategy } from './strategies/twitter.auth.strategy';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'dev',
        signOptions: { expiresIn: '3 days' },
      }),
    }),
    UserModule,
    MailModule,
    TypeOrmModule.forFeature([
      UserEntity,
      NotificationPreferenceEntity,
      PartnershipEntity,
      PartnerUserLinkEntity,
      PartnershipActivityEntity,
    ]),
    NotificationModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    AppleStrategy,
    TwitterStrategy,
  ],
})
export class AuthModule {}
