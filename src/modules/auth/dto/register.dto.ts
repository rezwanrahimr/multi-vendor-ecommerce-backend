import {
  IsEmail,
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

const REGISTER_ROLES = ['CUSTOMER', 'VENDOR'] as const;
type RegisterRole = (typeof REGISTER_ROLES)[number];

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsIn(REGISTER_ROLES)
  role?: RegisterRole;

  @IsOptional()
  @IsString()
  storeName?: string;
}