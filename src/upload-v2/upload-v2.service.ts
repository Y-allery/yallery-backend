import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import {
  CreateSignedUploadParamsOptions,
  SignedUploadParams,
  UploadV2BufferParams,
  UploadV2RemoteUrlParams,
  UploadV2ResourceType,
} from './upload-v2.types';

const DEFAULT_IMAGE_FOLDER = 'octoai_images';
const DEFAULT_VIDEO_FOLDER = 'octoai_videos';

@Injectable()
export class UploadV2Service {
  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadBuffer(params: UploadV2BufferParams): Promise<string> {
    const folder = params.folder ?? this.getDefaultImageFolder();
    const resourceType =
      params.resourceType ?? this.resolveResourceType(params.mimetype);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: params.publicId,
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          const secureUrl = result?.secure_url;
          if (!secureUrl) {
            reject(new Error('Cloudinary did not return a secure URL'));
            return;
          }

          resolve(secureUrl);
        },
      );

      uploadStream.end(params.buffer);
    });
  }

  async uploadRemoteUrl(params: UploadV2RemoteUrlParams): Promise<string> {
    const folder = params.folder ?? this.getDefaultImageFolder();
    const resourceType = params.resourceType ?? 'auto';

    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        params.sourceUrl,
        {
          folder,
          public_id: params.publicId,
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          const secureUrl = result?.secure_url;
          if (!secureUrl) {
            reject(new Error('Cloudinary did not return a secure URL'));
            return;
          }

          resolve(secureUrl);
        },
      );
    });
  }

  async uploadImageBuffer(
    buffer: Buffer,
    mimetype: string = 'image/png',
    folder = this.getDefaultImageFolder(),
  ): Promise<string> {
    return this.uploadBuffer({
      buffer,
      mimetype,
      folder,
      resourceType: this.resolveResourceType(mimetype),
    });
  }

  async uploadImageUrl(
    sourceUrl: string,
    folder = this.getDefaultImageFolder(),
  ): Promise<string> {
    return this.uploadRemoteUrl({
      sourceUrl,
      folder,
      resourceType: 'auto',
    });
  }

  async uploadVideoUrl(
    sourceUrl: string,
    folder = this.getDefaultVideoFolder(),
  ): Promise<string> {
    return this.uploadRemoteUrl({
      sourceUrl,
      folder,
      resourceType: 'video',
    });
  }

  createSignedUploadParams(
    options: CreateSignedUploadParamsOptions = {},
  ): SignedUploadParams {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary configuration is missing');
    }

    const folder = options.folder ?? this.getDefaultImageFolder();
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign: Record<string, string | number> = {
      folder,
      timestamp,
    };

    if (options.publicId) {
      paramsToSign.public_id = options.publicId;
    }

    if (options.resourceType && options.resourceType !== 'auto') {
      paramsToSign.resource_type = options.resourceType;
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret,
    );

    return {
      cloudName,
      apiKey,
      folder,
      timestamp,
      signature,
      publicId: options.publicId,
      resourceType: options.resourceType,
    };
  }

  private resolveResourceType(mimetype?: string): UploadV2ResourceType {
    if (!mimetype) {
      return 'auto';
    }

    if (mimetype.startsWith('video/')) {
      return 'video';
    }

    if (mimetype.startsWith('image/')) {
      return 'image';
    }

    return 'auto';
  }

  private getDefaultImageFolder(): string {
    return (
      this.configService.get<string>('CLOUDINARY_IMAGE_FOLDER') ??
      DEFAULT_IMAGE_FOLDER
    );
  }

  private getDefaultVideoFolder(): string {
    return (
      this.configService.get<string>('CLOUDINARY_VIDEO_FOLDER') ??
      DEFAULT_VIDEO_FOLDER
    );
  }
}
