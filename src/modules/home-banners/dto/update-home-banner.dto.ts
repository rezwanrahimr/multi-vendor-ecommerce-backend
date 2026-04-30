import { IsOptional, IsString } from 'class-validator';

export class UpdateHomeBannerDto {
  @IsOptional()
  @IsString()
  redirectLink?: string;
}
