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
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AUTH_SWAGGER } from 'src/common/swagger';
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
  @ApiOperation(AUTH_SWAGGER.login)
  @ApiBody({ 
    type: SignInDto,
    description: 'User credentials (email and password)'
  })
  @ApiResponse(AUTH_SWAGGER.login.responses.success)
  @ApiResponse(AUTH_SWAGGER.login.responses.unauthorized)
  @ApiResponse(AUTH_SWAGGER.login.responses.badRequest)
  async login(@Body() loginDto: SignInDto) {
    return this.authService.login(loginDto);
  }

  @Post('admin/login')
  @ApiOperation(AUTH_SWAGGER.adminLogin)
  @ApiBody({ 
    type: SignInDto,
    description: 'Admin credentials (email and password)'
  })
  @ApiResponse(AUTH_SWAGGER.adminLogin.responses.success)
  @ApiResponse(AUTH_SWAGGER.adminLogin.responses.unauthorized)
  @ApiResponse(AUTH_SWAGGER.adminLogin.responses.forbidden)
  async loginAdmin(@Body() loginDto: SignInDto) {
    return this.authService.loginAdmin(loginDto);
  }

  @Post('register')
  @ApiOperation({
    summary: 'User registration',
    description: `Create a new user account. After registration, a verification email will be sent to the provided email address.

**Registration Process:**
1. Validates email format and password strength
2. Checks if email is already registered
3. Creates new user account (initially unverified)
4. Sends verification email to the provided address
5. Returns user data and tokens (email must be verified before full access)

**Email Verification:**
- User must click the verification link in the email
- Unverified accounts have limited access
- Verification link expires after 24 hours`
  })
  @ApiBody({ 
    type: SignUpDto,
    description: 'User registration data (email, password, name, optional referral code)'
  })
  @ApiResponse({
    status: 201,
    description: 'Registration successful - user created and verification email sent',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            email: { type: 'string' },
            name: { type: 'string' },
            emailVerified: { type: 'boolean', example: false }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad request - email already exists, invalid input, or weak password' 
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Conflict - email is already registered' 
  })
  async register(@Body() signUpDto: SignUpDto) {
    return this.authService.register(signUpDto);
  }

  @Post('resend-email')
  @ApiOperation(AUTH_SWAGGER.resendEmail)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
          description: 'The email address of the user to resend the verification email',
        },
      },
      required: ['email'],
    },
  })
  @ApiResponse(AUTH_SWAGGER.resendEmail.responses.success)
  @ApiResponse(AUTH_SWAGGER.resendEmail.responses.notFound)
  @ApiResponse(AUTH_SWAGGER.resendEmail.responses.badRequest)
  async resendEmail(@Body('email') email: string) {
    return this.authService.resendVerificationEmail(email);
  }

  @Get('verify-email')
  @ApiOperation(AUTH_SWAGGER.verifyEmail)
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Email verification token from the verification email',
    type: String
  })
  @ApiResponse(AUTH_SWAGGER.verifyEmail.responses.success)
  @ApiResponse(AUTH_SWAGGER.verifyEmail.responses.badRequest)
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
  @ApiOperation(AUTH_SWAGGER.refresh)
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse(AUTH_SWAGGER.refresh.responses.success)
  @ApiResponse(AUTH_SWAGGER.refresh.responses.unauthorized)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @Post('request-reset-password')
  @ApiOperation(AUTH_SWAGGER.requestResetPassword)
  @ApiBody({ type: RequestResetPasswordDto })
  @ApiResponse(AUTH_SWAGGER.requestResetPassword.responses.success)
  @ApiResponse(AUTH_SWAGGER.requestResetPassword.responses.notFound)
  async requestResetPassword(@Body() dto: RequestResetPasswordDto) {
    await this.authService.requestResetPassword(dto.email);
    return { message: 'Password reset link sent to your email' };
  }

  @Get('reset-password')
  @ApiOperation({ summary: 'Reset password page', description: 'Display password reset form page' })
  @ApiQuery({ name: 'token', required: true, type: String })
  async resetPasswordPage(@Query('token') token: string, @Res() res: Response) {
    return this.authService.handleResetPasswordPage(token, res);
  }

  @Post('request-change-email')
  @ApiOperation(AUTH_SWAGGER.requestChangeEmail)
  @ApiBody({ type: RequestChangeEmailDto })
  @ApiResponse(AUTH_SWAGGER.requestChangeEmail.responses.success)
  async requestChangeEmail(@Body() dto: RequestChangeEmailDto) {
    await this.authService.requestChangeEmail(dto.currentEmail);
    return { message: 'Confirmation link sent to your current email' };
  }

  @Get('confirm-change-email')
  @ApiOperation({ summary: 'Confirm email change page', description: 'Display email change confirmation form page' })
  @ApiQuery({ name: 'token', required: true, type: String })
  async changeEmailPage(@Query('token') token: string, @Res() res: Response) {
    return this.authService.handleConfirmEmailPage(token, res);
  }

  @Post('confirm-change-email')
  @ApiOperation(AUTH_SWAGGER.confirmChangeEmail)
  @ApiBody({ type: ConfirmChangeEmailDto })
  @ApiResponse(AUTH_SWAGGER.confirmChangeEmail.responses.success)
  @ApiResponse(AUTH_SWAGGER.confirmChangeEmail.responses.badRequest)
  async confirmChangeEmail(
    @Body() dto: ConfirmChangeEmailDto,
    @Res() res: Response,
  ) {
    return this.authService.processConfirmChangeEmail(dto, res);
  }

  @Post('reset-password')
  @ApiOperation(AUTH_SWAGGER.resetPassword)
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse(AUTH_SWAGGER.resetPassword.responses.success)
  @ApiResponse(AUTH_SWAGGER.resetPassword.responses.badRequest)
  async resetPassword(@Body() dto: ResetPasswordDto, @Res() res: Response) {
    return this.authService.processResetPassword(dto, res);
  }

  @Post('google-login')
  @ApiOperation(AUTH_SWAGGER.googleLogin)
  @ApiResponse(AUTH_SWAGGER.googleLogin.responses.success)
  @ApiResponse(AUTH_SWAGGER.googleLogin.responses.unauthorized)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        ref: { type: 'string', description: 'Referral token from partnership link' },
        puid: { type: 'string', description: 'Partner user id from external partner' },
      },
      required: ['token'],
    },
  })
  async googleLogin(@Body() body: { token: string; ref?: string; puid?: string }) {
    const payload = await this.authService.verifyGoogleAccessToken(body.token);
    return this.authService.signUpWithOAuth(payload, { ref: body.ref, puid: body.puid });
  }

  @Post('apple-login')
  @ApiOperation(AUTH_SWAGGER.appleLogin)
  @ApiResponse(AUTH_SWAGGER.appleLogin.responses.success)
  @ApiResponse(AUTH_SWAGGER.appleLogin.responses.unauthorized)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        ref: { type: 'string', description: 'Referral token from partnership link' },
        puid: { type: 'string', description: 'Partner user id from external partner' },
      },
      required: ['token'],
    },
  })
  async appleLogin(@Body() body: { token: string; ref?: string; puid?: string }) {
    const payload = await this.authService.verifyAppleToken(body.token);
    return this.authService.signUpWithOAuth(payload, { ref: body.ref, puid: body.puid });
  }

  @Get('telegram-login')
  @ApiOperation(AUTH_SWAGGER.telegramLogin)
  @ApiResponse(AUTH_SWAGGER.telegramLogin.responses.success)
  @ApiResponse(AUTH_SWAGGER.telegramLogin.responses.unauthorized)
  async loginWithTelegram(@Query() query: Record<string, string>) {
    const initData = new URLSearchParams(query).toString();

    return this.authService.loginWithTelegram(initData);
  }

  @Get('twitter-init')
  @ApiOperation({ summary: 'Initialize Twitter OAuth', description: 'Initialize Twitter OAuth flow' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  async twitterInit(@Query('userId') userId: string, @Req() req, @Res() res) {
    req.session.twitterState = userId;
    return res.redirect('/auth/twitter');
  }

  @Get('twitter')
  @UseGuards(AuthGuard('twitter'))
  @ApiOperation({ summary: 'Twitter OAuth login', description: 'Redirect to Twitter OAuth' })
  async twitterLogin() {}

  @Get('twitter/callback')
  @UseGuards(AuthGuard('twitter'))
  @ApiOperation({ summary: 'Twitter OAuth callback', description: 'Handle Twitter OAuth callback' })
  async twitterLoginCallback(@Req() req, @Res() res: Response) {
    res.redirect('https://t.me/yallery_mini_bot?startapp');
  }

  @Get()
  @ApiOperation({ summary: 'Index page', description: 'Serve index HTML page' })
  async index(@Res() res: Response) {
    res.sendFile(join(__dirname, '..', '..', '..', 'public', 'index.html'));
  }
}
