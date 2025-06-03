import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-twitter';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwitterStrategy extends PassportStrategy(Strategy, 'twitter') {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    super({
      consumerKey: configService.get('TWITTER_CONSUMER_KEY'),
      consumerSecret: configService.get('TWITTER_CONSUMER_SECRET'),
      scope: ['tweet.write'],
      callbackURL: `${configService.get<string>('HOME_URL')}/auth/twitter/callback`,
      includeEmail: true,
      passReqToCallback: true,
    });
  }

  async validate(req: any, token: string, tokenSecret: string) {
    const userId = req.session.twitterState;

    return await this.authService.linkTwitterToken(userId, token, tokenSecret);
  }
}
