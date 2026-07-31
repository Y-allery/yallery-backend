import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PartnershipSource } from 'src/modules/admin/entities/partner.entity';

@Injectable()
export class BranchLinkService {
  private readonly logger = new Logger(BranchLinkService.name);

  constructor(private readonly configService: ConfigService) {}

  async createReferralLink(params: {
    source: PartnershipSource;
    contestId?: number | string | null;
    referralToken: string;
  }): Promise<string> {
    const { source, contestId, referralToken } = params;

    if (source === PartnershipSource.MINI_APP) {
      return `https://t.me/yallery_bot?start=${referralToken}`;
    }

    if (source === PartnershipSource.WEB_APP) {
      const baseUrl =
        this.configService.get<string>('WEB_APP_URL') ||
        'https://yallery.web.app';

      if (contestId && Number(contestId) > 0) {
        return `${baseUrl.replace(/\/$/, '')}/contests/${contestId}?ref=${referralToken}`;
      }

      return `${baseUrl.replace(/\/$/, '')}/?ref=${referralToken}`;
    }

    const branchPayload: any = {
      branch_key:
        this.configService.get<string>('BRANCH_KEY') || process.env.BRANCH_KEY,
      data: {
        $canonical_identifier: `referral/${referralToken}`,
        $desktop_url: 'https://cuyab.app.link/rhHoT4tRzTb',
        $ios_url: 'https://apps.apple.com/us/app/yallery/id6456609257',
        $android_url:
          'https://play.google.com/store/apps/details?id=app.yallery.y_allery_mobile_client&pli=1',
        referral_token: referralToken,
        $og_title: "Join me on Y'allery. Let's generate pictures together!",
        contest_id: contestId ? Number(contestId) : null,
      },
    };

    this.logger.log(
      'Branch.io payload: ' + JSON.stringify(branchPayload, null, 2),
    );

    const branchResponse = await axios.post(
      'https://api2.branch.io/v1/url',
      branchPayload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    return BranchLinkService.withReferralToken(
      branchResponse.data.url,
      referralToken,
    );
  }

  /**
   * Appends `?ref=<token>` to a Branch URL, the way the web-app branch above already does.
   *
   * The token is also baked into the link's `referral_token` data field, but the signup
   * path never reads that key — it reads `ref` off the query string, which Branch passes
   * through into getLatestReferringParams. So a bare Branch link hands the app a `puid`
   * with no `ref`, and `if (dto.ref && dto.puid)` silently declines to link the user.
   */
  static withReferralToken(url: string, referralToken: string): string {
    if (!url) {
      return url;
    }

    try {
      const parsed = new URL(url);
      if (parsed.searchParams.get('ref')) {
        return url;
      }
      parsed.searchParams.set('ref', referralToken);
      return parsed.toString();
    } catch {
      // Never let a link Branch returned in an unexpected shape break creation.
      return url.includes('ref=')
        ? url
        : `${url}${url.includes('?') ? '&' : '?'}ref=${encodeURIComponent(referralToken)}`;
    }
  }
}
