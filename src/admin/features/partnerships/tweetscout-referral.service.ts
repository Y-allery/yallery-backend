import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as https from 'https';
import { Repository } from 'typeorm';
import { PartnershipActivityEntity } from '../../entities/partnership-activity.entity';

@Injectable()
export class TweetScoutReferralService {
  private readonly logger = new Logger(TweetScoutReferralService.name);
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnerShipActivityRepository: Repository<PartnershipActivityEntity>,
  ) {
    this.apiKey = this.configService.get<string>('TWEETSCOUT_API_KEY');
  }

  async checkRetweet(
    userHandle: string,
    partnershipId: number,
    userId: number,
  ): Promise<{ retweet: boolean }> {
    const userLink = `https://twitter.com/${userHandle}`;
    const searchText = '@y_allery';
    const maxTweetsToCheck = 15;
    let cursor: string | null = null;
    let totalTweetsChecked = 0;
    let found = false;

    try {
      while (totalTweetsChecked < maxTweetsToCheck && !found) {
        const requestBody: any = {
          link: userLink,
        };

        if (cursor) {
          requestBody.cursor = cursor;
        }

        const options = {
          method: 'POST',
          hostname: 'api.tweetscout.io',
          path: '/v2/user-tweets',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ApiKey: this.apiKey,
          },
        };

        const response = await new Promise<any>((resolve, reject) => {
          const req = https.request(options, (res) => {
            const chunks: Uint8Array[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
              const responseBody = Buffer.concat(chunks).toString();
              try {
                const parsed = JSON.parse(responseBody);
                resolve(parsed);
              } catch (error) {
                this.logger.error(
                  `[checkRetweet] JSON parse error: ${error.message}`,
                  error.stack,
                );
                reject(error);
              }
            });
          });

          req.on('error', (error) => {
            this.logger.error(
              `[checkRetweet] Request error: ${error.message}`,
              error.stack,
            );
            reject(error);
          });

          req.write(JSON.stringify(requestBody));
          req.end();
        });

        const tweets = response?.tweets || [];

        for (const tweet of tweets) {
          totalTweetsChecked++;

          if (totalTweetsChecked > maxTweetsToCheck) {
            break;
          }

          const tweetText = tweet.full_text || '';
          const tweetId = tweet.id_str || 'unknown';

          if (tweetText.toLowerCase().includes(searchText.toLowerCase())) {
            this.logger.log(`[checkRetweet] FOUND POST WITH @yallery MENTION!`);
            this.logger.log(`[checkRetweet] Tweet ID: ${tweetId}`);
            this.logger.log(`[checkRetweet] Full Text: "${tweetText}"`);
            this.logger.log(
              `[checkRetweet] Tweet URL: https://twitter.com/${userHandle}/status/${tweetId}`,
            );
            found = true;
            break;
          }
        }

        if (found) {
          break;
        }

        cursor = response?.next_cursor || null;
        if (!cursor || tweets.length === 0) {
          break;
        }
      }

      if (found) {
        await this.saveRetweetActivity(partnershipId, userId);
      }

      return { retweet: found };
    } catch (error) {
      this.logger.error(
        `[checkRetweet] Error checking retweet for ${userHandle}: ${error.message}`,
        error.stack,
      );
      return { retweet: false };
    }
  }

  private async saveRetweetActivity(partnershipId: number, userId: number) {
    try {
      const existingActivity = await this.partnerShipActivityRepository
        .createQueryBuilder('pa')
        .where('pa.partnershipId = :pid', { pid: partnershipId })
        .andWhere('pa.userId = :uid', { uid: userId })
        .andWhere('pa.activity = :flag', { flag: 'retweet' })
        .limit(1)
        .getOne();

      if (existingActivity) {
        return;
      }

      const activity = this.partnerShipActivityRepository.create({
        partnershipId,
        userId,
        activity: 'retweet',
      });
      await this.partnerShipActivityRepository.save(activity);
    } catch (error) {
      this.logger.error(
        `[checkRetweet] Error saving to database: ${error.message}`,
        error.stack,
      );
    }
  }
}
