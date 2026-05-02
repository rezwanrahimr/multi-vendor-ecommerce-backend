import { IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;
}
