import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { PaginatioDto } from 'src/common/dto/pagination.dto';
import { UserEntity } from './entities/user.entity';
import { RoleEnum } from './types/role.enum';

describe('UserController', () => {
  let controller: UserController;
  let userService: jest.Mocked<Pick<UserService, 'getAllUsers'>>;

  const mockUser: Partial<UserEntity> = {
    id: 1,
    name: 'Test User',
    nickname: 'testuser',
    email: 'test@example.com',
    avatar: null,
    notificationsEnabled: true,
    points: 100,
    role: RoleEnum.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockGetAllUsers = jest.fn();
    const mockUserService = {
      getAllUsers: mockGetAllUsers,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UserController>(UserController);
    userService = module.get(UserService) as jest.Mocked<Pick<UserService, 'getAllUsers'>>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUsers', () => {
    it('should return paginated users from UserService.getAllUsers', async () => {
      const pagination: PaginatioDto = { page: 1, limit: 10 };
      const expected = {
        data: [mockUser as UserEntity],
        total: 1,
      };
      jest.spyOn(userService, 'getAllUsers').mockResolvedValue(expected);

      const result = await controller.getUsers(pagination);

      expect(userService.getAllUsers).toHaveBeenCalledWith(pagination);
      expect(result).toEqual(expected);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should pass page and limit to getAllUsers', async () => {
      const pagination: PaginatioDto = { page: 2, limit: 5 };
      const expected = { data: [], total: 0 };
      jest.spyOn(userService, 'getAllUsers').mockResolvedValue(expected);

      await controller.getUsers(pagination);

      expect(userService.getAllUsers).toHaveBeenCalledWith({ page: 2, limit: 5 });
    });

    it('should return empty list when no users exist', async () => {
      const pagination: PaginatioDto = { page: 1, limit: 10 };
      const expected = { data: [], total: 0 };
      jest.spyOn(userService, 'getAllUsers').mockResolvedValue(expected);

      const result = await controller.getUsers(pagination);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
