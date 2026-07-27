import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';

const IMAGE_UPLOAD_LIMIT_MB = 100;
const IMAGE_UPLOAD_LIMIT_BYTES = IMAGE_UPLOAD_LIMIT_MB * 1024 * 1024;
// Batch upload: the client sends a whole picker selection in one request, which
// is also one throttler hit instead of N.
const IMAGE_BATCH_MAX_FILES = 10;
const IMAGE_BATCH_CONCURRENCY = 3;
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

  @Post('images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', IMAGE_BATCH_MAX_FILES, {
      limits: { fileSize: IMAGE_UPLOAD_LIMIT_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Upload several images in one request',
    description: `Multipart field \`files\`, up to ${IMAGE_BATCH_MAX_FILES} images. Returns \`imageUrls\` in the same order as the uploaded files, so the client can map results positionally. All-or-nothing: if any file fails the whole request fails, so a returned array is always complete.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Uploaded image URLs, in order' })
  @ApiResponse({ status: 400, description: 'No files provided or too many' })
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ imageUrls: string[] }> {
    if (!files?.length) {
      throw new HttpException('No files provided', HttpStatus.BAD_REQUEST);
    }
    if (files.length > IMAGE_BATCH_MAX_FILES) {
      throw new HttpException(
        `Too many files: at most ${IMAGE_BATCH_MAX_FILES} per request`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Parallel, but capped: a batch of large images would otherwise hold that
      // many buffers in flight against Spaces at once.
      const imageUrls: string[] = new Array(files.length);
      for (let start = 0; start < files.length; start += IMAGE_BATCH_CONCURRENCY) {
        const slice = files.slice(start, start + IMAGE_BATCH_CONCURRENCY);
        const uploaded = await Promise.all(
          slice.map((file) =>
            this.uploadService.uploadByBuffer(file.buffer, file.mimetype),
          ),
        );
        uploaded.forEach((url, offset) => {
          imageUrls[start + offset] = url;
        });
      }
      return { imageUrls };
    } catch (error) {
      throw new HttpException(
        `Failed to upload images: ${error.message}`,
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
