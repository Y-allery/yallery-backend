import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { UPLOAD_SWAGGER } from 'src/common/swagger';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
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

  @Post('video')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload video file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Video URL' })
  @ApiResponse({ status: 400, description: 'No file provided' })
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ videoUrl: string }> {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }
    try {
      const videoUrl = await this.uploadService.uploadVideoByBuffer(file.buffer);
      return { videoUrl };
    } catch (error) {
      throw new HttpException(
        `Failed to upload video: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
