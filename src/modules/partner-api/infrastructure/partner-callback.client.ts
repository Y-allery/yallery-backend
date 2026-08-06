import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PartnerJobView } from '../application/partner-job.service';
import { isPublicHttpUrl } from '../domain/public-url';

export interface PartnerCallbackResult {
  delivered: boolean;
  httpStatus: number | null;
  error: string | null;
}

const TIMEOUT_MS = 10_000;

@Injectable()
export class PartnerCallbackClient {
  private readonly logger = new Logger(PartnerCallbackClient.name);

  /**
   * Posts a finished job to the partner's URL.
   *
   * Redirects are refused rather than followed: the destination is validated once, and a
   * 302 into 169.254.169.254 is exactly how that validation gets bypassed. The response
   * body is capped and never logged in full — it is a stranger's output on our disk.
   */
  async deliver(
    url: string,
    deliveryId: string,
    payload: PartnerJobView,
  ): Promise<PartnerCallbackResult> {
    if (!isPublicHttpUrl(url)) {
      return {
        delivered: false,
        httpStatus: null,
        error: 'callback_url is not a public http(s) address',
      };
    }

    try {
      const response = await axios.post(url, payload, {
        timeout: TIMEOUT_MS,
        maxRedirects: 0,
        maxContentLength: 64 * 1024,
        validateStatus: () => true,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Yallery-Webhook/1',
          'X-Yallery-Event': `generation.${payload.status}`,
          'X-Yallery-Job-Id': payload.id,
          'X-Yallery-Delivery': deliveryId,
        },
      });

      const delivered = response.status >= 200 && response.status < 300;
      return {
        delivered,
        httpStatus: response.status,
        error: delivered ? null : `callback returned ${response.status}`,
      };
    } catch (error) {
      this.logger.warn(
        `callback delivery to ${new URL(url).host} failed: ${error?.code ?? error?.message}`,
      );
      return {
        delivered: false,
        httpStatus: null,
        error: String(error?.code ?? error?.message ?? 'delivery failed').slice(
          0,
          255,
        ),
      };
    }
  }
}
