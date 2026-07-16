import {
  Controller,
  Get,
  NotFoundException,
  PayloadTooLargeException,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ObjectTooLargeError } from 'src/modules/uploads/spaces-storage.service';
import { MediaResourceType } from './media-transformations';
import { MediaProxyService, ResolvedMedia } from './media-proxy.service';

/**
 * Deterministic answers (derived variants are immutable, their CDN URL never
 * changes) — let browsers and any edge cache keep them for a year.
 */
const IMMUTABLE_REDIRECT_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const ATTACHMENT_CACHE_CONTROL = 'public, max-age=86400';
/**
 * Fallback answers after a failed generation: the next attempt may succeed,
 * so no cache anywhere may pin the degraded response.
 */
const FALLBACK_CACHE_CONTROL = 'no-cache';

/**
 * Cloudinary-compatible media URLs over DO Spaces:
 *   GET /media/{image|video}/upload/[t_<name>/]<key>
 *
 * The mobile app inserts named transformations (t_.../) after the
 * /image/upload/ or /video/upload/ marker — exactly as it did with
 * res.cloudinary.com URLs. Originals redirect straight to the CDN; derived
 * variants are generated once, cached back into Spaces and then also served
 * from the CDN. fl_attachment variants stream with Content-Disposition.
 */
@ApiExcludeController()
@Controller('media')
export class MediaProxyController {
  constructor(private readonly mediaProxyService: MediaProxyService) {}

  @Get('image/upload/*')
  async serveImage(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.serve('image', request, response);
  }

  @Get('video/upload/*')
  async serveVideo(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.serve('video', request, response);
  }

  private async serve(
    resourceType: MediaResourceType,
    request: Request,
    response: Response,
  ): Promise<void> {
    const rawPath = request.params[0] ?? '';
    let resolved: ResolvedMedia;
    try {
      resolved = await this.mediaProxyService.resolve(resourceType, rawPath);
    } catch (error) {
      if (error instanceof ObjectTooLargeError) {
        throw new PayloadTooLargeException('Media object too large');
      }
      throw error;
    }

    if (resolved.redirectUrl) {
      // 301 lets HTTP-cache-aware clients (browsers, CDN edges) skip the
      // whole API round-trip on repeat loads; fallbacks stay temporary.
      response.setHeader(
        'Cache-Control',
        resolved.cacheable
          ? IMMUTABLE_REDIRECT_CACHE_CONTROL
          : FALLBACK_CACHE_CONTROL,
      );
      response.redirect(resolved.cacheable ? 301 : 302, resolved.redirectUrl);
      return;
    }

    const bodyStream = resolved.bodyStream;
    if (!bodyStream) {
      throw new NotFoundException('Media not found');
    }

    response.setHeader(
      'Cache-Control',
      resolved.cacheable ? ATTACHMENT_CACHE_CONTROL : FALLBACK_CACHE_CONTROL,
    );
    response.setHeader(
      'Content-Type',
      resolved.contentType ?? 'application/octet-stream',
    );
    if (resolved.attachmentFilename) {
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${resolved.attachmentFilename.replace(/"/g, '')}"`,
      );
    }
    if (resolved.contentLength !== null) {
      response.setHeader('Content-Length', String(resolved.contentLength));
    }

    bodyStream.on('error', (error) => {
      console.warn(
        `[MediaProxyController] attachment stream failed: ${error.message}`,
      );
      if (!response.headersSent) {
        response.removeHeader('Content-Length');
        response.status(502).send();
      } else {
        // Mid-body failure — kill the socket so the client sees a broken
        // transfer instead of a silently truncated file.
        response.destroy();
      }
    });
    // Client aborts must not leak the upstream S3 connection.
    response.on('close', () => {
      if (!bodyStream.destroyed) bodyStream.destroy();
    });
    bodyStream.pipe(response);
  }
}
