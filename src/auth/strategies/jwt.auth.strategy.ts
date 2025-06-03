import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';
import { RoleEnum } from 'src/user/types/role.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private userService: UserService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET') || 'dev',
    });
  }

  async validate(payload: any): Promise<{ id: number; role: RoleEnum }> {
    const user = await this.userService.findById(payload.sub);
    if (!user || user.is_deleted) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      role: user.role,
    };
  }
}
