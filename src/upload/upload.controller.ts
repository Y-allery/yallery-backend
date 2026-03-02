import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';

const IMAGE_UPLOAD_LIMIT_MB = 25;
const IMAGE_UPLOAD_LIMIT_BYTES = IMAGE_UPLOAD_LIMIT_MB * 1024 * 1024;
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { UPLOAD_SWAGGER } from 'src/common/swagger';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly configService: ConfigService,
  ) {}

  /** Params for direct video upload to Cloudinary from client (avoids 413 / large body through nginx) */
  @Get('cloudinary-params')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Cloudinary params for direct video upload' })
  @ApiResponse({ status: 200, description: 'cloudName and optional uploadPreset' })
  getCloudinaryParams(): { cloudName: string; uploadPreset?: string } {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const uploadPreset = this.configService.get<string>('CLOUDINARY_VIDEO_UPLOAD_PRESET');
    if (!cloudName) {
      throw new HttpException('Cloudinary not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { cloudName, uploadPreset: uploadPreset || undefined };
  }

  @Post('image')
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
      const imageUrl = await this.uploadService.uploadByBuffer(file.buffer);
      return { imageUrl };
    } catch (error) {
      throw new HttpException(
        `Failed to upload image: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

}
