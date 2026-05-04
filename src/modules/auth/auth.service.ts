import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { createSlug } from '../../utils/slug.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialLoginDto } from './dto/social-login.dto';

type SocialProfile = {
  providerId: string;
  email: string;
  name: string;
  avatarUrl?: string;
};

type GoogleTokenInfo = {
  sub?: string;
  user_id?: string;
  aud?: string;
  audience?: string;
  email?: string;
  email_verified?: string | boolean;
  verified_email?: string | boolean;
  name?: string;
  picture?: string;
};

type FacebookProfile = {
  id?: string;
  email?: string;
  name?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
};

type FacebookTokenDebug = {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    user_id?: string;
  };
};

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

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is inactive or suspended');
    }

    return this.buildAuthResponse(user);
  }

  async socialLogin(dto: SocialLoginDto) {
    if (dto.role && dto.role !== UserRole.CUSTOMER) {
      throw new UnauthorizedException('Social login is only available for customers');
    }

    const profile = await this.verifySocialToken(dto);
    const existingProviderUser = await this.prisma.user.findUnique({
      where: {
        authProvider_providerId: {
          authProvider: dto.provider,
          providerId: profile.providerId,
        },
      },
    });

    if (existingProviderUser) {
      return this.loginSocialCustomer(existingProviderUser);
    }

    const existingEmailUser = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (existingEmailUser) {
      if (existingEmailUser.role !== UserRole.CUSTOMER) {
        throw new UnauthorizedException('Social login is only available for customers');
      }

      const linkedUser = await this.prisma.user.update({
        where: { id: existingEmailUser.id },
        data: {
          authProvider: dto.provider,
          providerId: profile.providerId,
          name: profile.name || existingEmailUser.name,
          avatarUrl: profile.avatarUrl ?? existingEmailUser.avatarUrl,
        },
      });

      return this.loginSocialCustomer(linkedUser);
    }

    const user = await this.prisma.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        role: UserRole.CUSTOMER,
        authProvider: dto.provider,
        providerId: profile.providerId,
      },
    });

    return this.loginSocialCustomer(user);
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

  private loginSocialCustomer(user: User) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new UnauthorizedException('Social login is only available for customers');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is inactive or suspended');
    }

    return this.buildAuthResponse(user);
  }

  private async verifySocialToken(dto: SocialLoginDto): Promise<SocialProfile> {
    if (dto.provider === 'GOOGLE') {
      return this.verifyGoogleToken(dto.token);
    }

    if (dto.provider === 'FACEBOOK') {
      return this.verifyFacebookToken(dto.token);
    }

    throw new BadRequestException('Unsupported social login provider');
  }

  private async verifyGoogleToken(token: string): Promise<SocialProfile> {
    const tokenInfo = await this.fetchJson<GoogleTokenInfo>(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
      'Unable to verify Google login',
    );
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    if (!clientId) {
      throw new UnauthorizedException('Google login is not configured');
    }

    const audience = tokenInfo.aud ?? tokenInfo.audience;
    const providerId = tokenInfo.sub ?? tokenInfo.user_id;
    const emailVerified = tokenInfo.email_verified ?? tokenInfo.verified_email;

    if (audience !== clientId) {
      throw new UnauthorizedException('Google login token audience is invalid');
    }

    if (!providerId || !tokenInfo.email) {
      throw new UnauthorizedException('Google account did not provide email');
    }

    if (emailVerified === false || emailVerified === 'false') {
      throw new UnauthorizedException('Google email is not verified');
    }

    return {
      providerId,
      email: tokenInfo.email,
      name: tokenInfo.name ?? tokenInfo.email.split('@')[0],
      avatarUrl: tokenInfo.picture,
    };
  }

  private async verifyFacebookToken(token: string): Promise<SocialProfile> {
    const appId = this.configService.get<string>('FACEBOOK_APP_ID');
    const appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET');

    if (!appId || !appSecret) {
      throw new UnauthorizedException('Facebook login is not configured');
    }

    const tokenDebug = await this.fetchJson<FacebookTokenDebug>(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
      'Unable to verify Facebook login',
    );

    if (!tokenDebug.data?.is_valid || tokenDebug.data.app_id !== appId) {
      throw new UnauthorizedException('Facebook login token is invalid');
    }

    const profile = await this.fetchJson<FacebookProfile>(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(token)}`,
      'Unable to verify Facebook login',
    );

    if (tokenDebug.data.user_id && profile.id !== tokenDebug.data.user_id) {
      throw new UnauthorizedException('Facebook login token user is invalid');
    }

    if (!profile.id || !profile.email) {
      throw new UnauthorizedException('Facebook account did not provide email');
    }

    return {
      providerId: profile.id,
      email: profile.email,
      name: profile.name ?? profile.email.split('@')[0],
      avatarUrl: profile.picture?.data?.url,
    };
  }

  private async fetchJson<T>(url: string, errorMessage: string): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url);
    } catch {
      throw new UnauthorizedException(errorMessage);
    }

    if (!response.ok) {
      throw new UnauthorizedException(errorMessage);
    }

    return response.json() as Promise<T>;
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
