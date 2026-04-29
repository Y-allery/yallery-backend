import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from '@arendajaelu/nestjs-passport-apple';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('APPLE_CLIENT_ID'),
      teamID: configService.get<string>('APPLE_TEAM_ID'),
      keyID: configService.get<string>('APPLE_KEY_ID'),
      key: configService.get<string>('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      callbackURL: `${configService.get<string>('HOME_URL')}/auth/apple/redirect`,
      passReqToCallback: true,
      scope: ['name', 'email'],
      response_type: 'code id_token',
    });
  }

  async validate(
    req: any,
    accessToken: string,
    refreshToken: string,
    idToken: any,
  ): Promise<any> {
    const user = {
      email: idToken.email,
      firstName: idToken?.name?.firstName,
      lastName: idToken?.name?.lastName,
    };
    return { ...user };
  }
}
