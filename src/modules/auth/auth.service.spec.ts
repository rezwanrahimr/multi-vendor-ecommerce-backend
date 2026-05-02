import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { validateSync } from 'class-validator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

describe('AuthService security rules', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const jwtService = {
    sign: jest.fn().mockReturnValue('signed-token'),
  };
  const configService = {
    get: jest.fn((_key: string, fallback?: string) => fallback ?? '7d'),
    getOrThrow: jest.fn().mockReturnValue('test-secret'),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as never,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('rejects inactive users during login', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'customer@example.com',
      name: 'Customer',
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.SUSPENDED,
    });

    await expect(
      service.login({
        email: 'customer@example.com',
        password: 'Password123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('rejects wrong passwords without issuing a token', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'customer@example.com',
      name: 'Customer',
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    });

    await expect(
      service.login({
        email: 'customer@example.com',
        password: 'WrongPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('allows public registration DTOs only for customer and vendor roles', () => {
    const dto = Object.assign(new RegisterDto(), {
      name: 'Bad Actor',
      email: 'bad@example.com',
      password: 'Password123!',
      role: UserRole.ADMIN,
    });

    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });
});
