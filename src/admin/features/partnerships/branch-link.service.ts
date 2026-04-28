import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PartnershipSource } from '../../entities/partner.entity';

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

    return branchResponse.data.url;
  }
}
