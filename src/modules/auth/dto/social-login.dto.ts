import { AuthProvider, UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class SocialLoginDto {
  @IsEnum(AuthProvider)
  provider: AuthProvider;

  @IsString()
  providerId: string;

  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsIn([UserRole.CUSTOMER, UserRole.VENDOR])
  role?: UserRole;
}
