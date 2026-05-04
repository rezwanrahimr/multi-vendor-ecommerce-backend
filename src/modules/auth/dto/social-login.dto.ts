import { AuthProvider, UserRole } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SocialLoginDto {
  @IsIn([AuthProvider.GOOGLE, AuthProvider.FACEBOOK])
  provider: AuthProvider;

  @IsString()
  token: string;

  @IsOptional()
  @IsIn([UserRole.CUSTOMER])
  role?: UserRole;
}
