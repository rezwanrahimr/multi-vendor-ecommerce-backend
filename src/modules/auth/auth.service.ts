import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { createSlug } from '../../utils/slug.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialLoginDto } from './dto/social-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role =
      dto.role === UserRole.VENDOR ? UserRole.VENDOR : UserRole.CUSTOMER;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role,
        wallet: role === UserRole.VENDOR ? { create: {} } : undefined,
        store:
          role === UserRole.VENDOR
            ? {
                create: {
                  name: dto.storeName ?? `${dto.name}'s Store`,
                  slug: createSlug(`${dto.storeName ?? dto.name}-${dto.email}`),
                },
              }
            : undefined,
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(user);
  }

  async socialLogin(dto: SocialLoginDto) {
    const role =
      dto.role === UserRole.VENDOR ? UserRole.VENDOR : UserRole.CUSTOMER;
    const user = await this.prisma.user.upsert({
      where: {
        authProvider_providerId: {
          authProvider: dto.provider,
          providerId: dto.providerId,
        },
      },
      update: {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
      },
      create: {
        name: dto.name,
        email: dto.email,
        avatarUrl: dto.avatarUrl,
        authProvider: dto.provider,
        providerId: dto.providerId,
        role,
        wallet: role === UserRole.VENDOR ? { create: {} } : undefined,
        store:
          role === UserRole.VENDOR
            ? {
                create: {
                  name: `${dto.name}'s Store`,
                  slug: createSlug(`${dto.name}-${dto.email}`),
                },
              }
            : undefined,
      },
    });

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
        status: true,
        store: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  private buildAuthResponse(user: User) {
    return {
      user: this.sanitizeUser(user),
      accessToken: this.signAccessToken(user),
    };
  }

  private signAccessToken(user: User) {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: this.configService.getOrThrow<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiresIn', '7d'),
      },
    );
  }

  private sanitizeUser(user: User) {
    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return safeUser;
  }
}
