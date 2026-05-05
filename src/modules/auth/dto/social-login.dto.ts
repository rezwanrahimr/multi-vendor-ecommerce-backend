import { IsIn, IsOptional, IsString } from 'class-validator';

const SOCIAL_PROVIDERS = ['GOOGLE', 'FACEBOOK'] as const;
const SOCIAL_ROLES = ['CUSTOMER'] as const;

type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
type SocialRole = (typeof SOCIAL_ROLES)[number];

export class SocialLoginDto {
  @IsIn(SOCIAL_PROVIDERS)
  provider: SocialProvider;

  @IsString()
  token: string;

  @IsOptional()
  @IsIn(SOCIAL_ROLES)
  role?: SocialRole;
}