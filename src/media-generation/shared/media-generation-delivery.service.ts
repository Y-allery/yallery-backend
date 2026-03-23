import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { MediaGenerationDeliveryEntity } from '../entities/media-generation-delivery.entity';
import {
  MediaGenerationDeliveryEventType,
  MediaGenerationErrorDeliveryPayload,
  MediaGenerationModality,
} from './media-generation.types';

@Injectable()
export class MediaGenerationDeliveryService {
  constructor(
    @InjectRepository(MediaGenerationDeliveryEntity)
    private readonly deliveryRepository: Repository<MediaGenerationDeliveryEntity>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async deliverImageFailure(params: {
    requestId: string;
    userId: number;
    error: string;
  }): Promise<void> {
    const payload: MediaGenerationErrorDeliveryPayload = {
      requestId: params.requestId,
      error: params.error,
      modality: MediaGenerationModality.IMAGE,
    };

    const delivery = this.deliveryRepository.create({
      id: randomUUID(),
      requestId: params.requestId,
      userId: params.userId,
      eventType: MediaGenerationDeliveryEventType.IMAGE_GENERATION_FAILED,
      payload: payload as unknown as Record<string, unknown>,
      isDelivered: false,
      deliveredAt: null,
    });

    await this.deliveryRepository.save(delivery);

    if (!this.notificationGateway.isUserConnected(params.userId.toString())) {
      return;
    }

    await this.notificationGateway.sendImageGenerationFailed(
      params.userId.toString(),
      payload,
    );

    await this.deliveryRepository.update(
      { id: delivery.id },
      {
        isDelivered: true,
        deliveredAt: new Date(),
      },
    );
  }

  async deliverAudioFailure(params: {
    requestId: string;
    userId: number;
    error: string;
  }): Promise<void> {
    const payload: MediaGenerationErrorDeliveryPayload = {
      requestId: params.requestId,
      error: params.error,
      modality: MediaGenerationModality.AUDIO,
    };

    const delivery = this.deliveryRepository.create({
      id: randomUUID(),
      requestId: params.requestId,
      userId: params.userId,
      eventType: MediaGenerationDeliveryEventType.AUDIO_GENERATION_FAILED,
      payload: payload as unknown as Record<string, unknown>,
      isDelivered: false,
      deliveredAt: null,
    });

    await this.deliveryRepository.save(delivery);

    if (!this.notificationGateway.isUserConnected(params.userId.toString())) {
      return;
    }

    await this.notificationGateway.sendAudioGenerationFailed(
      params.userId.toString(),
      payload,
    );

    await this.deliveryRepository.update(
      { id: delivery.id },
      {
        isDelivered: true,
        deliveredAt: new Date(),
      },
    );
  }
}
