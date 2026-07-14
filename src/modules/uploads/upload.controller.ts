import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';

const IMAGE_UPLOAD_LIMIT_MB = 100;
const IMAGE_UPLOAD_LIMIT_BYTES = IMAGE_UPLOAD_LIMIT_MB * 1024 * 1024;
// Matches the admin client's REFERENCE_VIDEO_MAX_SIZE_MB. Requires nginx
// client_max_body_size >= 100m in front of the app.
const VIDEO_UPLOAD_LIMIT_MB = 100;
const VIDEO_UPLOAD_LIMIT_BYTES = VIDEO_UPLOAD_LIMIT_MB * 1024 * 1024;

const VIDEO_FILENAME_PATTERN = /\.(mp4|mov|m4v|webm)$/i;

import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { UPLOAD_SWAGGER } from 'src/shared/swagger';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: IMAGE_UPLOAD_LIMIT_BYTES },
    }),
  )
  @ApiOperation(UPLOAD_SWAGGER.uploadImage)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse(UPLOAD_SWAGGER.uploadImage.responses.success)
  @ApiResponse(UPLOAD_SWAGGER.uploadImage.responses.badRequest)
  @ApiResponse(UPLOAD_SWAGGER.uploadImage.responses.internalError)
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ imageUrl: string }> {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }

    try {
      const imageUrl = await this.uploadService.uploadByBuffer(
        file.buffer,
        file.mimetype,
      );
      return { imageUrl };
    } catch (error) {
      throw new HttpException(
        `Failed to upload image: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: VIDEO_UPLOAD_LIMIT_BYTES },
    }),
  )
  @ApiOperation(UPLOAD_SWAGGER.uploadVideo)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse(UPLOAD_SWAGGER.uploadVideo.responses.success)
  @ApiResponse(UPLOAD_SWAGGER.uploadVideo.responses.badRequest)
  @ApiResponse(UPLOAD_SWAGGER.uploadVideo.responses.internalError)
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ videoUrl: string }> {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }
    const isVideo =
      file.mimetype?.startsWith('video/') ||
      VIDEO_FILENAME_PATTERN.test(file.originalname ?? '');
    if (!isVideo) {
      throw new HttpException(
        'Unsupported file type: expected a video (MP4, MOV or WebM)',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const videoUrl = await this.uploadService.uploadVideoByBuffer(
        file.buffer,
        file.mimetype,
        file.originalname,
      );
      return { videoUrl };
    } catch (error) {
      throw new HttpException(
        `Failed to upload video: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
