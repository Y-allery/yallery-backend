import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/modules/users/user.service';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/integrations/mail/mail.service';
import { MailQueueService } from 'src/integrations/mail/queue/mail-queue.service';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { sendHtmlResponse } from 'src/shared/helpers/send.html.response.func';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { ConfirmChangeEmailDto } from './dto/reset-email.dto';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { OAuthPayload } from './types/oauth.payload.interface';
import verifyAppleToken from 'apple-signin-auth';
import { RoleEnum } from 'src/modules/users/types/role.enum';
import * as crypto from 'crypto';
import { PartnerLinkService } from 'src/modules/admin/features/partnerships/partner-link.service';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { RewardService } from 'src/modules/billing/rewards/reward.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private client: OAuth2Client;
  private oauth2Client;

  constructor(
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly mailQueueService: MailQueueService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly rewardService: RewardService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly partnerLinkService: PartnerLinkService,
    @Inject(NotificationGateway)
    private readonly notificationGateway: NotificationGateway,
  ) {
    this.client = new OAuth2Client(this.configService.get('GOOGLE_CLIENT_ID'));
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
    );
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserEntity | null> {
    const user = await this.userService.findByEmail(email);
    if (!user || user.isDeleted) {
      throw new BadRequestException('User not found or is deactivated');
    }

    if (!user.password)
      throw new BadRequestException('Please login via Google or Apple auth');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }

  async generateAccessToken(user: UserEntity): Promise<string> {
    return this.jwtService.sign({ sub: user.id });
  }

  async generateRefreshToken(user: UserEntity): Promise<string> {
    const refreshToken = this.jwtService.sign({}, { expiresIn: '7d' });
    user.refreshToken = refreshToken;
    await this.userRepository.save(user);
    return refreshToken;
  }

  async login(
    dto: SignInDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.validateUser(dto.email, dto.password);

    // Відмічаємо що користувач може клеймити DAILY_LOGIN нагороду
    try {
      await this.rewardService.markRewardEligible(
        user.id,
        RewardTypeEnum.DAILY_LOGIN,
      );
    } catch (error) {
      // Ігноруємо помилки (можливо вже відмічено)
      console.warn('[login] Failed to mark DAILY_LOGIN eligible:', error);
    }

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);
    return { accessToken, refreshToken };
  }

  async loginAdmin(
    dto: SignInDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.validateUser(dto.email, dto.password);

    if (user.role !== RoleEnum.ADMIN) {
      throw new ForbiddenException();
    }

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);
    return { accessToken, refreshToken };
  }

  private generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async register(dto: SignUpDto): Promise<any> {
    const userExists = await this.isUserExist(dto.email, dto.nickname);
    if (userExists) {
      throw new BadRequestException(
        'User with given nickname or email already exists',
      );
    }
    const newUser = await this.createUser(dto);
    const verificationToken = this.generateVerificationToken();
    newUser.verificationToken = verificationToken;
    // Persisted before the mail is queued: a token that only ever existed in
    // the job payload would verify nothing if the row write failed.
    await this.userRepository.save(newUser);

    // Attribution lives in PartnerLinkService; these ref/puid branches go away once the
    // clients move to POST /user/bind-partner.
    if (dto.ref && dto.puid) {
      const outcome = await this.partnerLinkService.linkPartnerUser({
        ref: dto.ref,
        puid: dto.puid,
        userId: newUser.id,
      });
      if (outcome !== 'linked') {
        this.logger.warn(
          `[register] partner link not established | ${JSON.stringify({
            userId: newUser.id,
            outcome,
          })}`,
        );
      }
    }

    // Відмічаємо що користувач може клеймити DAILY_LOGIN нагороду (після реєстрації це перший логін)
    try {
      await this.rewardService.markRewardEligible(
        newUser.id,
        RewardTypeEnum.DAILY_LOGIN,
      );
    } catch (error) {
      console.warn('[register] Failed to mark DAILY_LOGIN eligible:', error);
    }

    const accessToken = await this.generateAccessToken(newUser);
    const refreshToken = await this.generateRefreshToken(newUser);

    // Queued, not sent inline: SendGrid erroring or throttling used to fail
    // the request after the account row was already committed, leaving the
    // caller with a 500 and an account they could neither verify nor resend
    // to. The queue retries; registration never fails on mail.
    await this.enqueueVerificationEmail(
      newUser.id,
      dto.email,
      verificationToken,
    );

    return {
      user: this.excludeSensitiveFields(newUser),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Re-issues the verification token and queues a fresh email. The token is
   * regenerated rather than reused: when the original mail never left, the
   * user has no way to tell, and a new token invalidates any link that leaked
   * with the failed send.
   */
  async resendVerification(userId: number): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.isDeleted) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      return { message: 'Email is already verified' };
    }

    const queued = await this.reissueVerificationEmail(user);

    return {
      message: queued
        ? 'Verification email queued'
        : 'Verification email could not be queued, please try again later',
    };
  }

  /**
   * Regenerates the token, persists it, then queues the mail — in that order,
   * so the link in the email can never be one the database does not know.
   */
  private async reissueVerificationEmail(user: UserEntity): Promise<boolean> {
    if (!user.email || user.email.includes('@telegram.local')) {
      throw new BadRequestException(
        'This account has no email address to verify',
      );
    }

    const verificationToken = this.generateVerificationToken();
    user.verificationToken = verificationToken;
    await this.userRepository.save(user);

    return this.enqueueVerificationEmail(
      user.id,
      user.email,
      verificationToken,
    );
  }

  private async enqueueVerificationEmail(
    userId: number,
    email: string,
    verificationToken: string,
  ): Promise<boolean> {
    const verifyUrl = `${process.env.HOME_URL}/auth/verify-email?token=${verificationToken}`;
    const queued = await this.mailQueueService.enqueueEmailVerification({
      userId,
      email,
      subject: 'Verify Your Email',
      verifyUrl,
    });

    if (!queued) {
      this.logger.error(
        `Verification email for user ${userId} was not queued; the user must use /auth/resend-verification`,
      );
    }

    return queued;
  }

  async verifyEmail(token: string): Promise<UserEntity | null> {
    const user = await this.userRepository.findOne({
      where: { verificationToken: token },
    });
    if (!user) return null;

    user.emailVerified = true;
    user.verificationToken = null;
    await this.userRepository.save(user);
    await this.notificationGateway.emitEmailVerifiedStatus(
      user.id.toString(),
      true,
    );
    return user;
  }

  private async isUserExist(email: string, nickname: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: [{ email }, { nickname }],
    });
    return !!user;
  }

  private async createUser(dto: SignUpDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const registrationBonus = await this.rewardService.getRewardPointsOrDefault(
      RewardTypeEnum.REGISTRATION_BONUS,
      3000,
    );
    const newUser = this.userRepository.create({
      ...dto,
      password: hashedPassword,
      isDeleted: false,
      points: registrationBonus,
      emailVerified: false,
    });
    await this.userRepository.save(newUser);
    return newUser;
  }

  private excludeSensitiveFields(user: UserEntity) {
    const { password, refreshToken, ...safeUser } = user;
    return safeUser;
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userRepository.findOne({ where: { refreshToken } });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const accessToken = await this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user);
    return { accessToken, refreshToken: newRefreshToken };
  }

  async handleResetPasswordPage(token: string, res: Response) {
    const isValidToken = await this.validateResetToken(token);
    const template = isValidToken
      ? 'reset-password.html'
      : 'reset-password-error.html';
    const status = isValidToken ? HttpStatus.OK : HttpStatus.FORBIDDEN;
    return sendHtmlResponse(res, template, status, { token });
  }

  async handleConfirmEmailPage(token: string, res: Response) {
    const isValidToken = await this.validateResetToken(token);
    if (isValidToken) {
      return sendHtmlResponse(res, 'change-email.html', HttpStatus.OK, {
        token,
      });
    } else {
      return sendHtmlResponse(
        res,
        'change-email-error.html',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async processConfirmChangeEmail(dto: ConfirmChangeEmailDto, res: Response) {
    try {
      await this.confirmChangeEmail(dto.token, dto.newEmail);
      return sendHtmlResponse(res, 'change-email-success.html', HttpStatus.OK);
    } catch (error) {
      return sendHtmlResponse(
        res,
        'change-email-error.html',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async processResetPassword(dto: ResetPasswordDto, res: Response) {
    try {
      await this.resetPassword(dto.token, dto.newPassword);
      return sendHtmlResponse(
        res,
        'reset-password-success.html',
        HttpStatus.OK,
      );
    } catch {
      return sendHtmlResponse(
        res,
        'reset-password-error.html',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async validateResetToken(token: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { resetToken: token, resetTokenExpiration: MoreThan(new Date()) },
    });
    return !!user;
  }

  async requestResetPassword(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    user.resetToken = uuidv4();
    user.resetTokenExpiration = new Date(Date.now() + 3600000);
    await this.userRepository.save(user);
    const resetUrl = `${this.configService.get('HOME_URL')}/auth/reset-password?token=${user.resetToken}`;
    await this.mailService.sendResetPasswordEmail(email, resetUrl);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { resetToken: token, resetTokenExpiration: MoreThan(new Date()) },
    });
    if (!user)
      throw new UnauthorizedException('Invalid or expired reset token');
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpiration = null;
    await this.userRepository.save(user);
  }

  async confirmChangeEmail(token: string, newEmail: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: {
        resetToken: token,
        resetTokenExpiration: MoreThan(new Date()),
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const emailExists = await this.userRepository.findOne({
      where: { email: newEmail },
    });

    if (emailExists) {
      throw new ConflictException(
        'This email is already in use. Please try another one.',
      );
    }

    user.email = newEmail;
    user.resetToken = null;
    user.resetTokenExpiration = null;
    await this.userRepository.save(user);
  }

  async requestChangeEmail(currentEmail: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: currentEmail },
    });
    if (!user) throw new NotFoundException('User not found');

    user.resetToken = uuidv4();
    user.resetTokenExpiration = new Date(Date.now() + 3600000);
    await this.userRepository.save(user);

    const changeEmailUrl = `${this.configService.get('HOME_URL')}/auth/confirm-change-email?token=${user.resetToken}`;
    await this.mailService.sendGenericEmail(
      currentEmail,
      'Change Your Email',
      changeEmailUrl,
    );
  }

  private logOAuth(stage: string, payload: Record<string, unknown>) {
    this.logger.log(`[oauth] ${stage} | ${JSON.stringify(payload)}`);
  }

  async verifyAppleToken(token: string) {
    this.logOAuth('apple-verify-start', {
      provider: 'apple',
      hasToken: Boolean(token),
    });

    const payload = await verifyAppleToken.verifyIdToken(token, {
      audience: process.env.APPLE_CLIENT_ID,
    });

    this.logOAuth('apple-verify-success', {
      provider: 'apple',
      email: payload.email ?? null,
      subject: payload.sub,
    });

    return {
      firstName: payload.sub,
      lastName: payload.sub,
      email: payload.email,
    };
  }
  async verifyGoogleAccessToken(token: string) {
    this.logOAuth('google-verify-start', {
      provider: 'google',
      hasToken: Boolean(token),
    });

    this.oauth2Client.setCredentials({
      access_token: token,
    });

    const oauth2 = google.oauth2({
      auth: this.oauth2Client,
      version: 'v2',
    });

    try {
      const { data } = await oauth2.userinfo.get();

      this.logOAuth('google-verify-success', {
        provider: 'google',
        email: data.email ?? null,
        firstName: data.given_name ?? null,
        lastName: data.family_name ?? null,
      });

      return {
        firstName: data.given_name,
        lastName: data.family_name,
        email: data.email,
      };
    } catch (error) {
      this.logger.error(
        `[oauth] google-verify-failed | ${JSON.stringify({
          provider: 'google',
          message: error?.message ?? 'unknown',
        })}`,
        error?.stack,
      );
      throw new BadRequestException('Failed to verify Google token');
    }
  }

  async signUpWithOAuth(
    payload: OAuthPayload,
    extras?: {
      ref?: string;
      puid?: string;
      provider?: 'google' | 'apple' | 'oauth';
    },
  ) {
    const provider = extras?.provider ?? 'oauth';

    this.logOAuth('signup-flow-start', {
      provider,
      email: payload.email ?? null,
      hasRef: Boolean(extras?.ref),
      hasPuid: Boolean(extras?.puid),
    });

    let user = await this.userRepository.findOne({
      where: { email: payload.email },
    });

    if (!user) {
      const registrationBonus =
        await this.rewardService.getRewardPointsOrDefault(
          RewardTypeEnum.REGISTRATION_BONUS,
          3000,
        );
      user = this.userRepository.create({
        name: `${payload.firstName} ${payload.lastName}`,
        email: payload.email,
        points: registrationBonus,
      });
      await this.userRepository.save(user);

      this.logOAuth('user-created', {
        provider,
        userId: user.id,
        email: user.email,
      });

      // Відмічаємо що користувач може клеймити DAILY_LOGIN нагороду (після реєстрації це перший логін)
      try {
        await this.rewardService.markRewardEligible(
          user.id,
          RewardTypeEnum.DAILY_LOGIN,
        );
      } catch (error) {
        console.warn(
          '[signUpWithOAuth] Failed to mark DAILY_LOGIN eligible for new user:',
          error,
        );
      }

      if (extras?.ref && extras?.puid) {
        const outcome = await this.partnerLinkService.linkPartnerUser({
          ref: extras.ref,
          puid: extras.puid,
          userId: user.id,
        });
        this.logOAuth('partner-link-outcome', {
          provider,
          userId: user.id,
          partnerUserId: extras.puid,
          outcome,
          isNewUser: true,
        });
      } else {
        this.logOAuth('partnership-skipped-missing-referral-data', {
          provider,
          userId: user.id,
          email: user.email,
          hasRef: Boolean(extras?.ref),
          hasPuid: Boolean(extras?.puid),
          isNewUser: true,
        });
      }
    } else {
      this.logOAuth('existing-user-found', {
        provider,
        userId: user.id,
        email: user.email,
      });

      // Existing user logging in via OAuth: attempt to link partnership if referral extras provided
      // Відмічаємо що користувач може клеймити DAILY_LOGIN нагороду
      try {
        await this.rewardService.markRewardEligible(
          user.id,
          RewardTypeEnum.DAILY_LOGIN,
        );
      } catch (error) {
        console.warn(
          '[signUpWithOAuth] Failed to mark DAILY_LOGIN eligible:',
          error,
        );
      }

      if (extras?.ref && extras?.puid) {
        const outcome = await this.partnerLinkService.linkPartnerUser({
          ref: extras.ref,
          puid: extras.puid,
          userId: user.id,
        });
        this.logOAuth('partner-link-outcome', {
          provider,
          userId: user.id,
          partnerUserId: extras.puid,
          outcome,
          isNewUser: false,
        });
      } else {
        this.logOAuth('partnership-skipped-missing-referral-data', {
          provider,
          userId: user.id,
          email: user.email,
          hasRef: Boolean(extras?.ref),
          hasPuid: Boolean(extras?.puid),
          isNewUser: false,
        });
      }
    }

    this.logOAuth('signup-flow-finished', {
      provider,
      userId: user.id,
      email: user.email,
      hasRef: Boolean(extras?.ref),
      hasPuid: Boolean(extras?.puid),
    });

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);
    return { accessToken, refreshToken };
  }
  validateTelegramAuth(initData: string): boolean {
    const parsed = new URLSearchParams(initData);
    const hash = parsed.get('hash');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(this.configService.get('TELEGRAM_BOT_TOKEN'))
      .digest();

    const authDate = parseInt(parsed.get('auth_date') ?? '0', 10);

    if (authDate) {
      if (authDate < Date.now() / 1000 - 86400) {
        throw new UnauthorizedException('Auth date is too old');
      }
    } else {
      // Auth date is not provided or is null
    }

    parsed.delete('hash');
    parsed.delete('id');

    const dataCheckString = Array.from(parsed.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const isValid = computedHash === hash;
    if (isValid) {
      // Telegram authentication validated successfully
    } else {
      // Telegram authentication validation failed. Hash mismatch
    }

    return isValid;
  }

  async loginWithTelegram(
    initData: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const isValid = this.validateTelegramAuth(initData);
    if (!isValid) {
      throw new BadRequestException('Invalid Telegram data');
    }

    const parsed = new URLSearchParams(initData);
    const userJson = parsed.get('user');
    let telegramId: number,
      username: string,
      firstName: string | null,
      lastName: string | null;

    if (userJson) {
      const user = JSON.parse(userJson);
      telegramId = user.id;
      username = user.username || `tg-user-${telegramId}`;
      firstName = user.first_name || '';
      lastName = user.last_name || '';
    } else {
      throw new BadRequestException('User data is missing');
    }

    const randomEmail = `user${telegramId}@telegram.local`;

    const randomPassword = crypto.randomBytes(8).toString('hex');

    let user = await this.userRepository.findOne({ where: { telegramId } });
    if (!user) {
      const registrationBonus =
        await this.rewardService.getRewardPointsOrDefault(
          RewardTypeEnum.REGISTRATION_BONUS,
          3000,
        );
      user = this.userRepository.create({
        telegramId,
        nickname: username,
        name: `${firstName} ${lastName}`.trim(),
        points: registrationBonus,
        email: randomEmail,
        password: randomPassword,
      });
      await this.userRepository.save(user);

      // Відмічаємо що користувач може клеймити DAILY_LOGIN нагороду (після реєстрації це перший логін)
      try {
        await this.rewardService.markRewardEligible(
          user.id,
          RewardTypeEnum.DAILY_LOGIN,
        );
      } catch (error) {
        console.warn(
          '[loginWithTelegram] Failed to mark DAILY_LOGIN eligible for new user:',
          error,
        );
      }
    } else {
      // Відмічаємо що користувач може клеймити DAILY_LOGIN нагороду
      try {
        await this.rewardService.markRewardEligible(
          user.id,
          RewardTypeEnum.DAILY_LOGIN,
        );
      } catch (error) {
        console.warn(
          '[loginWithTelegram] Failed to mark DAILY_LOGIN eligible:',
          error,
        );
      }
    }

    const accessToken = await this.generateAccessToken(user);

    const refreshToken = await this.generateRefreshToken(user);

    return { accessToken, refreshToken };
  }

  /**
   * Legacy unauthenticated resend. Kept for clients already calling it, but it
   * now goes through the same queued path as /auth/resend-verification: an
   * unknown address used to dereference `undefined` and answer 500, and the
   * inline send failed the request after the new token was already stored.
   */
  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(email);
    if (!user || user.isDeleted) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      return { message: 'Email is already verified' };
    }

    await this.reissueVerificationEmail(user);

    return {
      message: 'Verification email has been resent.',
    };
  }
  async linkTwitterToken(userId: string, token: string, tokenSecret: string) {
    const user = await this.userRepository.findOne({
      where: { id: +userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    user.twitterCredentials = {
      token,
      tokenSecret,
    };

    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(userId);
    return user;
  }
}
