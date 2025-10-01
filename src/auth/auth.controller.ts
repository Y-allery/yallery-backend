import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { join } from 'path';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  RequestResetPasswordDto,
  ResetPasswordDto,
} from './dto/reset-password.dto';
import {
  ConfirmChangeEmailDto,
  RequestChangeEmailDto,
} from './dto/reset-email.dto';
import { sendHtmlResponse } from 'src/common/helpers/send.html.response.func';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Post('login')
  @ApiBody({ type: SignInDto })
  async login(@Body() loginDto: SignInDto) {
    return this.authService.login(loginDto);
  }

  @Post('admin/login')
  @ApiBody({ type: SignInDto })
  async loginAdmin(@Body() loginDto: SignInDto) {
    return this.authService.loginAdmin(loginDto);
  }

  @Post('register')
  async register(@Body() signUpDto: SignUpDto) {
    return this.authService.register(signUpDto);
  }

  @Post('resend-email')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
          description:
            'The email address of the user to resend the verification email.',
        },
      },
      required: ['email'],
    },
  })
  async resendEmail(@Body('email') email: string) {
    return this.authService.resendVerificationEmail(email);
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    const user = await this.authService.verifyEmail(token);
    if (!user) {
      return sendHtmlResponse(
        res,
        'error-email-verify.html',
        HttpStatus.BAD_REQUEST,
        {
          errorMessage: 'Invalid or expired token.',
        },
      );
    }

    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return sendHtmlResponse(res, 'verify.email.html', HttpStatus.OK, {
      username: user.name,
      email: user.email,
    });
  }

  @Post('refresh')
  @ApiBody({ type: RefreshTokenDto })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Post('request-reset-password')
  @ApiBody({ type: RequestResetPasswordDto })
  async requestResetPassword(@Body() dto: RequestResetPasswordDto) {
    await this.authService.requestResetPassword(dto.email);
    return { message: 'Password reset link sent to your email' };
  }

  @Get('reset-password')
  async resetPasswordPage(@Query('token') token: string, @Res() res: Response) {
    return this.authService.handleResetPasswordPage(token, res);
  }

  @Post('request-change-email')
  @ApiBody({ type: RequestChangeEmailDto })
  async requestChangeEmail(@Body() dto: RequestChangeEmailDto) {
    await this.authService.requestChangeEmail(dto.currentEmail);
    return { message: 'Confirmation link sent to your current email' };
  }

  @Get('confirm-change-email')
  async changeEmailPage(@Query('token') token: string, @Res() res: Response) {
    return this.authService.handleConfirmEmailPage(token, res);
  }

  @Post('confirm-change-email')
  @ApiBody({ type: ConfirmChangeEmailDto })
  async confirmChangeEmail(
    @Body() dto: ConfirmChangeEmailDto,
    @Res() res: Response,
  ) {
    return this.authService.processConfirmChangeEmail(dto, res);
  }

  @Post('reset-password')
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: ResetPasswordDto, @Res() res: Response) {
    return this.authService.processResetPassword(dto, res);
  }

  @Post('google-login')
  @ApiBody({
    schema: { type: 'object', properties: { token: { type: 'string' } } },
  })
  async googleLogin(@Body('token') token: string) {
    const payload = await this.authService.verifyGoogleAccessToken(token);
    return this.authService.signUpWithOAuth(payload);
  }

  @Post('tegegram-login')
  @ApiBody({
    schema: { type: 'object', properties: { token: { type: 'string' } } },
  })
  async telegramLogin(@Body('token') token: string) {
    const payload = await this.authService.verifyGoogleAccessToken(token);
    return this.authService.signUpWithOAuth(payload);
  }

  @Post('apple-login')
  @ApiBody({
    schema: { type: 'object', properties: { token: { type: 'string' } } },
  })
  async appleLogin(@Body('token') token: string) {
    const payload = await this.authService.verifyAppleToken(token);
    return this.authService.signUpWithOAuth(payload);
  }

  @Get('telegram-login')
  @ApiOperation({ summary: 'Login or register via Telegram' })
  async loginWithTelegram(@Query() query: Record<string, string>) {
    const initData = new URLSearchParams(query).toString();

    return this.authService.loginWithTelegram(initData);
  }

  @Get('twitter-init')
  async twitterInit(@Query('userId') userId: string, @Req() req, @Res() res) {
    req.session.twitterState = userId;
    return res.redirect('/auth/twitter');
  }

  @Get('twitter')
  @UseGuards(AuthGuard('twitter'))
  async twitterLogin() {}

  @Get('twitter/callback')
  @UseGuards(AuthGuard('twitter'))
  async twitterLoginCallback(@Req() req, @Res() res: Response) {
    res.redirect('https://t.me/yallery_mini_bot?startapp');
  }

  @Get()
  async index(@Res() res: Response) {
    res.sendFile(join(__dirname, '..', '..', '..', 'public', 'index.html'));
  }
}
