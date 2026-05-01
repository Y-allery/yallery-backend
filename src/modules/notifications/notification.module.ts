import { Module, forwardRef } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { DatabaseModule } from 'src/core/database/database.module';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferenceEntity } from './entity/notification.preferences.entity';
import { UserModule } from 'src/modules/users/user.module';
import { PostEntity } from 'src/modules/posts/entities/post.entity';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([NotificationPreferenceEntity, PostEntity]),
    forwardRef(() => UserModule),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, JwtService],
  exports: [NotificationGateway],
})
export class NotificationModule {}
