import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

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
  @IsIn([UserRole.CUSTOMER, UserRole.VENDOR])
  role?: UserRole;

  @IsOptional()
  @IsString()
  storeName?: string;
}
