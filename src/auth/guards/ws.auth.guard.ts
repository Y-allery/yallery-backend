import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token =
      client.handshake.query.token || client.handshake.headers.authorization;

    try {
      const decoded = this.jwtService.verify(token as string, {
        secret: process.env.JWT_SECRET,
      });

      const userId = decoded?.sub ?? decoded?.id;
      if (userId == null) {
        throw new Error('Token payload does not contain a user id');
      }

      client.data.userId = userId.toString();
      return true;
    } catch (e) {
      client.emit('error', {
        message: 'Invalid or expired token',
        error: 'authentication_error',
      });
      client.disconnect(true);
      return false;
    }
  }
}
