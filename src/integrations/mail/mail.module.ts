import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailQueueService } from './queue/mail-queue.service';
import { MailProcessor } from './queue/mail.processor';
import { MAIL_QUEUE } from './queue/mail.queue';

@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailService, MailQueueService, MailProcessor],
  exports: [MailService, MailQueueService],
})
export class MailModule {}
