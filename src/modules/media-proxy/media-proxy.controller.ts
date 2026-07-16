import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { MediaResourceType } from './media-transformations';
import { MediaProxyService } from './media-proxy.service';

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
    const resolved = await this.mediaProxyService.resolve(
      resourceType,
      rawPath,
    );

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

    if (!resolved.body) {
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
    response.send(resolved.body);
  }
}
