import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PartnerController } from './partner.controller';
import { ContestModule } from 'src/contest/contest.module';
import { UserModule } from 'src/user/user.module';
import { PostModule } from 'src/post/post.module';
import { TagModule } from 'src/tag/tag.module';
import { ActivityModule } from 'src/activity/activity.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnershipEntity } from './entities/partner.entity';
import { PartnershipActivityEntity } from './entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from './entities/partner-user-link.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { AdminMetricsEntity } from './entities/admin-metrics.entity';
import { LikeEntity } from 'src/like/entities/like.entity';
import { PaymentEntity } from 'src/payment/entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnershipEntity,
      PartnershipActivityEntity,
      PartnerUserLinkEntity,
      PostEntity,
      UserEntity,
      AISettingsEntity,
      AdminMetricsEntity,
      LikeEntity,
      PaymentEntity,
    ]),
    ContestModule,
    UserModule,
    PostModule,
    TagModule,
    ActivityModule,
  ],
  providers: [AdminService],
  controllers: [AdminController, PartnerController],
})
export class AdminModule {}
