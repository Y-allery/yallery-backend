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
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { PartnershipEntity } from 'src/modules/admin/entities/partner.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
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
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly rewardService: RewardService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PartnershipEntity)
    private readonly partnershipRepo: Repository<PartnershipEntity>,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepo: Repository<PartnerUserLinkEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnershipActivityRepo: Repository<PartnershipActivityEntity>,
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
      await this.rewardService.markRewardEligible(user.id, RewardTypeEnum.DAILY_LOGIN);
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
    await this.userRepository.save(newUser);

    // Link to partnership if referral data provided
    if (dto.ref && dto.puid) {
      const partnership = await this.partnershipRepo.findOne({
        where: { referralToken: dto.ref },
      });
      if (partnership) {
        const existing = await this.partnerUserLinkRepo.findOne({
          where: {
            partnershipId: partnership.id,
            partnerUserId: dto.puid,
          },
        });
        if (!existing) {
          const link = this.partnerUserLinkRepo.create({
            partnershipId: partnership.id,
            partnerUserId: dto.puid,
            userId: newUser.id,
          });
          await this.partnerUserLinkRepo.save(link);
          
          // Log registered activity for new user
          try {
            const activity = this.partnershipActivityRepo.create({
              partnershipId: partnership.id,
              userId: newUser.id,
              activity: 'registered',
            });
            await this.partnershipActivityRepo.save(activity);
          } catch (error) {
            console.error(`[Register] Failed to log registered activity:`, error.message);
          }
        } else if (!existing.userId) {
          existing.userId = newUser.id;
          await this.partnerUserLinkRepo.save(existing);
          
          // Log registered activity for new user
          try {
            const activity = this.partnershipActivityRepo.create({
              partnershipId: partnership.id,
              userId: newUser.id,
              activity: 'registered',
            });
            await this.partnershipActivityRepo.save(activity);
          } catch (error) {
            console.error(`[Register] Failed to log registered activity (link updated):`, error.message);
          }
        }
        
        // Log partnership activity 'registered'
        try {
          const activityExists = await this.partnershipActivityRepo.findOne({
            where: {
              partnershipId: partnership.id,
              userId: newUser.id,
              activity: 'registered',
            },
          });
          if (!activityExists) {
            const activity = this.partnershipActivityRepo.create({
              partnershipId: partnership.id,
              userId: newUser.id,
              activity: 'registered',
            });
            await this.partnershipActivityRepo.save(activity);
            // Partnership activity 'registered' created for user
          }
        } catch (error) {
          console.error('[register] Failed to log partnership activity registered:', error?.stack || error);
        }
      }
    }

    // Відмічаємо що користувач може клеймити DAILY_LOGIN нагороду (після реєстрації це перший логін)
    try {
      await this.rewardService.markRewardEligible(newUser.id, RewardTypeEnum.DAILY_LOGIN);
    } catch (error) {
      console.warn('[register] Failed to mark DAILY_LOGIN eligible:', error);
    }

    const accessToken = await this.generateAccessToken(newUser);
    const refreshToken = await this.generateRefreshToken(newUser);

    const verifyUrl = `${process.env.HOME_URL}/auth/verify-email?token=${verificationToken}`;
    await this.mailService.sendEmailVerify(
      dto.email,
      'Verify Your Email',
      verifyUrl,
    );
    return {
      user: this.excludeSensitiveFields(newUser),
      accessToken,
      refreshToken,
    };
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
    extras?: { ref?: string; puid?: string; provider?: 'google' | 'apple' | 'oauth' },
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
      const registrationBonus = await this.rewardService.getRewardPointsOrDefault(
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
        await this.rewardService.markRewardEligible(user.id, RewardTypeEnum.DAILY_LOGIN);
      } catch (error) {
        console.warn('[signUpWithOAuth] Failed to mark DAILY_LOGIN eligible for new user:', error);
      }

      // Link to partnership if referral data provided (same logic as register)
      if (extras?.ref && extras?.puid) {
        const partnership = await this.partnershipRepo.findOne({
          where: { referralToken: extras.ref },
        });
        if (partnership) {
          this.logOAuth('partnership-found', {
            provider,
            userId: user.id,
            email: user.email,
            partnershipId: partnership.id,
            ref: extras.ref,
            puid: extras.puid,
            isNewUser: true,
          });
          const existing = await this.partnerUserLinkRepo.findOne({
            where: {
              partnershipId: partnership.id,
              partnerUserId: extras.puid,
            },
          });
          if (!existing) {
            const link = this.partnerUserLinkRepo.create({
              partnershipId: partnership.id,
              partnerUserId: extras.puid,
              userId: user.id,
            });
            await this.partnerUserLinkRepo.save(link);

            this.logOAuth('partner-link-created', {
              provider,
              userId: user.id,
              partnershipId: partnership.id,
              partnerUserId: extras.puid,
              isNewUser: true,
            });
            
            // Log partnership activity 'registered' for new OAuth user
            try {
              const activityExists = await this.partnershipActivityRepo.findOne({
                where: {
                  partnershipId: partnership.id,
                  userId: user.id,
                  activity: 'registered',
                },
              });
              if (!activityExists) {
                const activity = this.partnershipActivityRepo.create({
                  partnershipId: partnership.id,
                  userId: user.id,
                  activity: 'registered',
                });
                await this.partnershipActivityRepo.save(activity);
                this.logOAuth('partnership-activity-created', {
                  provider,
                  userId: user.id,
                  partnershipId: partnership.id,
                  activity: 'registered',
                  isNewUser: true,
                });
              } else {
                this.logOAuth('partnership-activity-already-exists', {
                  provider,
                  userId: user.id,
                  partnershipId: partnership.id,
                  activity: 'registered',
                  isNewUser: true,
                });
              }
            } catch (error) {
              console.error('[OAuth] Failed to log partnership activity registered:', error?.stack || error);
              this.logger.error(
                `[oauth] partnership-activity-create-failed | ${JSON.stringify({
                  provider,
                  userId: user.id,
                  partnershipId: partnership.id,
                  activity: 'registered',
                  isNewUser: true,
                  message: error?.message ?? 'unknown',
                })}`,
                error?.stack,
              );
            }
          } else if (!existing.userId) {
            existing.userId = user.id;
            await this.partnerUserLinkRepo.save(existing);
            this.logOAuth('partner-link-updated', {
              provider,
              userId: user.id,
              partnershipId: partnership.id,
              partnerUserId: extras.puid,
              existingLinkId: existing.id,
              isNewUser: true,
            });
          } else {
            this.logOAuth('partner-link-already-bound', {
              provider,
              userId: user.id,
              partnershipId: partnership.id,
              partnerUserId: extras.puid,
              existingLinkId: existing.id,
              existingLinkedUserId: existing.userId,
              isNewUser: true,
            });
          }
          
          // Log registered activity for new OAuth user
          try {
            const activity = this.partnershipActivityRepo.create({
              partnershipId: partnership.id,
              userId: user.id,
              activity: 'registered',
            });
            await this.partnershipActivityRepo.save(activity);
            this.logOAuth('registered-activity-created', {
              provider,
              userId: user.id,
              partnershipId: partnership.id,
              activity: 'registered',
              isNewUser: true,
            });
          } catch (error) {
            console.error(`[OAuth] Failed to log registered activity:`, error.message);
            this.logger.error(
              `[oauth] registered-activity-create-failed | ${JSON.stringify({
                provider,
                userId: user.id,
                partnershipId: partnership.id,
                activity: 'registered',
                isNewUser: true,
                message: error?.message ?? 'unknown',
              })}`,
              error?.stack,
            );
          }
        } else {
          console.warn(
            `[OAuth] Partnership not found for ref=${extras.ref}. Skipping link`,
          );
          this.logOAuth('partnership-not-found', {
            provider,
            userId: user.id,
            email: user.email,
            ref: extras.ref,
            puid: extras.puid,
            isNewUser: true,
          });
        }
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
        await this.rewardService.markRewardEligible(user.id, RewardTypeEnum.DAILY_LOGIN);
      } catch (error) {
        console.warn('[signUpWithOAuth] Failed to mark DAILY_LOGIN eligible:', error);
      }

      if (extras?.ref && extras?.puid) {
        try {
          const partnership = await this.partnershipRepo.findOne({
            where: { referralToken: extras.ref },
          });
          if (!partnership) {
            console.warn(
              `[OAuth] Partnership not found for ref=${extras.ref}.`,
            );
            this.logOAuth('partnership-not-found', {
              provider,
              userId: user.id,
              email: user.email,
              ref: extras.ref,
              puid: extras.puid,
              isNewUser: false,
            });
          } else {
            this.logOAuth('partnership-found', {
              provider,
              userId: user.id,
              email: user.email,
              partnershipId: partnership.id,
              ref: extras.ref,
              puid: extras.puid,
              isNewUser: false,
            });
            const existing = await this.partnerUserLinkRepo.findOne({
              where: {
                partnershipId: partnership.id,
                partnerUserId: extras.puid,
              },
            });
            if (!existing) {
              const link = this.partnerUserLinkRepo.create({
                partnershipId: partnership.id,
                partnerUserId: extras.puid,
                userId: user.id,
              });
              await this.partnerUserLinkRepo.save(link);

              this.logOAuth('partner-link-created', {
                provider,
                userId: user.id,
                partnershipId: partnership.id,
                partnerUserId: extras.puid,
                isNewUser: false,
              });

              // Log registered activity for existing user linking to partnership
              try {
                const activity = this.partnershipActivityRepo.create({
                  partnershipId: partnership.id,
                  userId: user.id,
                  activity: 'registered',
                });
                await this.partnershipActivityRepo.save(activity);
                this.logOAuth('registered-activity-created', {
                  provider,
                  userId: user.id,
                  partnershipId: partnership.id,
                  activity: 'registered',
                  isNewUser: false,
                });
              } catch (error) {
                console.error(`[OAuth] Failed to log registered activity for existing user:`, error.message);
                this.logger.error(
                  `[oauth] registered-activity-create-failed | ${JSON.stringify({
                    provider,
                    userId: user.id,
                    partnershipId: partnership.id,
                    activity: 'registered',
                    isNewUser: false,
                    message: error?.message ?? 'unknown',
                  })}`,
                  error?.stack,
                );
              }
            } else if (!existing.userId) {
              existing.userId = user.id;
              await this.partnerUserLinkRepo.save(existing);

              this.logOAuth('partner-link-updated', {
                provider,
                userId: user.id,
                partnershipId: partnership.id,
                partnerUserId: extras.puid,
                existingLinkId: existing.id,
                isNewUser: false,
              });

              // Log registered activity for existing user linking to partnership
              try {
                const activity = this.partnershipActivityRepo.create({
                  partnershipId: partnership.id,
                  userId: user.id,
                  activity: 'registered',
                });
                await this.partnershipActivityRepo.save(activity);
                this.logOAuth('registered-activity-created', {
                  provider,
                  userId: user.id,
                  partnershipId: partnership.id,
                  activity: 'registered',
                  isNewUser: false,
                });
              } catch (error) {
                console.error(`[OAuth] Failed to log registered activity for existing user (link updated):`, error.message);
                this.logger.error(
                  `[oauth] registered-activity-create-failed | ${JSON.stringify({
                    provider,
                    userId: user.id,
                    partnershipId: partnership.id,
                    activity: 'registered',
                    isNewUser: false,
                    message: error?.message ?? 'unknown',
                  })}`,
                  error?.stack,
                );
              }
            } else {
              this.logOAuth('partner-link-already-bound', {
                provider,
                userId: user.id,
                partnershipId: partnership.id,
                partnerUserId: extras.puid,
                existingLinkId: existing.id,
                existingLinkedUserId: existing.userId,
                isNewUser: false,
              });
            }
          }
        } catch (err) {
          console.error('[OAuth] Failed to link partnership for existing user:', err?.stack || err);
          this.logger.error(
            `[oauth] partnership-link-failed | ${JSON.stringify({
              provider,
              userId: user.id,
              email: user.email,
              ref: extras?.ref ?? null,
              puid: extras?.puid ?? null,
              isNewUser: false,
              message: err?.message ?? 'unknown',
            })}`,
            err?.stack,
          );
        }
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
      const registrationBonus = await this.rewardService.getRewardPointsOrDefault(
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
        await this.rewardService.markRewardEligible(user.id, RewardTypeEnum.DAILY_LOGIN);
      } catch (error) {
        console.warn('[loginWithTelegram] Failed to mark DAILY_LOGIN eligible for new user:', error);
      }
    } else {
      // Відмічаємо що користувач може клеймити DAILY_LOGIN нагороду
      try {
        await this.rewardService.markRewardEligible(user.id, RewardTypeEnum.DAILY_LOGIN);
      } catch (error) {
        console.warn('[loginWithTelegram] Failed to mark DAILY_LOGIN eligible:', error);
      }
    }

    const accessToken = await this.generateAccessToken(user);

    const refreshToken = await this.generateRefreshToken(user);

    return { accessToken, refreshToken };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(email);

    const newVerificationToken = this.generateVerificationToken();
    user.verificationToken = newVerificationToken;

    await this.userService.saveUser(user);

    const verifyUrl = `${process.env.HOME_URL}/auth/verify-email?token=${newVerificationToken}`;

    await this.mailService.sendEmailVerify(
      email,
      'Resend Email Verification',
      verifyUrl,
    );

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
