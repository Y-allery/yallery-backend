import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Registration used to await SendGrid inline, so a provider error or throttle
 * answered 500 *after* the account row was committed: the caller believed
 * signup failed, and the account existed with no way to get a new
 * verification mail. Mail now goes through a queue and can never fail signup.
 */
describe('AuthService verification email', () => {
  const createService = ({
    existingUser = null as any,
    enqueueResult = true,
  } = {}) => {
    const savedUsers: any[] = [];
    const userRepository = {
      findOne: jest.fn(async () => existingUser),
      create: jest.fn((data: any) => ({ id: 42, ...data })),
      save: jest.fn(async (user: any) => {
        savedUsers.push({ ...user });
        return user;
      }),
    };
    const mailService = {
      sendEmailVerify: jest.fn(async () => undefined),
    };
    const enqueued: Array<{
      userId: number;
      email: string;
      verifyUrl: string;
    }> = [];
    const mailQueueService = {
      enqueueEmailVerification: jest.fn(async (job: any) => {
        enqueued.push(job);
        return enqueueResult;
      }),
    };
    const userService = {
      findByEmail: jest.fn(async () => existingUser),
      saveUser: jest.fn(async (user: any) => user),
    };
    const rewardService = {
      getRewardPointsOrDefault: jest.fn(async () => 3000),
      markRewardEligible: jest.fn(async () => undefined),
    };
    const jwtService = { sign: jest.fn(() => 'jwt-token') };
    const configService = { get: jest.fn(() => undefined) };

    const service = new AuthService(
      userService as any,
      mailService as any,
      mailQueueService as any,
      jwtService as any,
      configService as any,
      rewardService as any,
      userRepository as any,
      {} as any, // partnershipRepo
      {} as any, // partnerUserLinkRepo
      {} as any, // partnershipActivityRepo
      {} as any, // notificationGateway
    );

    return {
      service,
      userRepository,
      mailService,
      mailQueueService,
      userService,
      savedUsers,
      enqueued,
    };
  };

  const signUpDto = {
    email: 'user@example.com',
    nickname: 'user',
    name: 'User',
    password: 'secret123',
  } as any;

  describe('register', () => {
    it('never sends the verification mail inline', async () => {
      const { service, mailService, mailQueueService } = createService();

      await service.register(signUpDto);

      expect(mailService.sendEmailVerify).not.toHaveBeenCalled();
      expect(mailQueueService.enqueueEmailVerification).toHaveBeenCalledWith(
        expect.objectContaining({ email: signUpDto.email }),
      );
    });

    it('still returns the account and tokens when the mail cannot be queued', async () => {
      const { service } = createService({ enqueueResult: false });

      const result = await service.register(signUpDto);

      expect(result.accessToken).toBe('jwt-token');
      expect(result.user).toEqual(expect.objectContaining({ id: 42 }));
    });

    it('persists the verification token before queueing the mail', async () => {
      const {
        service,
        userRepository,
        mailQueueService,
        savedUsers,
        enqueued,
      } = createService();

      await service.register(signUpDto);

      const saveOrder = Math.min(
        ...userRepository.save.mock.invocationCallOrder,
      );
      const enqueueOrder =
        mailQueueService.enqueueEmailVerification.mock.invocationCallOrder[0];
      expect(saveOrder).toBeLessThan(enqueueOrder);

      // The link in the mail must be a token the database already knows.
      const persistedToken = savedUsers.find(
        (user) => user.verificationToken,
      )?.verificationToken;
      const { verifyUrl } = enqueued[0];
      expect(persistedToken).toBeTruthy();
      expect(verifyUrl).toContain(persistedToken);
    });
  });

  describe('resendVerification', () => {
    it('issues a fresh token and queues a new mail', async () => {
      const user = {
        id: 42,
        email: 'user@example.com',
        emailVerified: false,
        isDeleted: false,
        verificationToken: 'stale-token',
      };
      const { service, userRepository, mailQueueService } = createService({
        existingUser: user,
      });

      const result = await service.resendVerification(42);

      expect(user.verificationToken).not.toBe('stale-token');
      expect(userRepository.save).toHaveBeenCalledWith(user);
      expect(mailQueueService.enqueueEmailVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          verifyUrl: expect.stringContaining(user.verificationToken),
        }),
      );
      expect(result.message).toBe('Verification email queued');
    });

    it('tells the caller when the queue refused the job instead of pretending it sent', async () => {
      const { service } = createService({
        existingUser: {
          id: 42,
          email: 'user@example.com',
          emailVerified: false,
          isDeleted: false,
        },
        enqueueResult: false,
      });

      const result = await service.resendVerification(42);

      expect(result.message).toMatch(/could not be queued/);
    });

    it('sends nothing when the address is already verified', async () => {
      const { service, mailQueueService } = createService({
        existingUser: {
          id: 42,
          email: 'user@example.com',
          emailVerified: true,
          isDeleted: false,
        },
      });

      await expect(service.resendVerification(42)).resolves.toEqual({
        message: 'Email is already verified',
      });
      expect(mailQueueService.enqueueEmailVerification).not.toHaveBeenCalled();
    });

    it('rejects accounts with no real email address', async () => {
      const { service } = createService({
        existingUser: {
          id: 42,
          email: '123@telegram.local',
          emailVerified: false,
          isDeleted: false,
        },
      });

      await expect(service.resendVerification(42)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('404s on an unknown user', async () => {
      const { service } = createService({ existingUser: null });

      await expect(service.resendVerification(42)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('resendVerificationEmail (legacy, by address)', () => {
    it('404s on an unknown address instead of crashing on undefined', async () => {
      const { service } = createService({ existingUser: null });

      await expect(
        service.resendVerificationEmail('nobody@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('goes through the queue like the authenticated resend', async () => {
      const { service, mailService, mailQueueService } = createService({
        existingUser: {
          id: 42,
          email: 'user@example.com',
          emailVerified: false,
          isDeleted: false,
        },
      });

      await service.resendVerificationEmail('user@example.com');

      expect(mailService.sendEmailVerify).not.toHaveBeenCalled();
      expect(mailQueueService.enqueueEmailVerification).toHaveBeenCalledTimes(
        1,
      );
    });
  });
});
