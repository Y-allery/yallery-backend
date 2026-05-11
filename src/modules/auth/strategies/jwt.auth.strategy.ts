import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/modules/users/user.service';
import { RoleEnum } from 'src/modules/users/types/role.enum';

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
    if (!user || user.isDeleted) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      role: user.role,
    };
  }
}
