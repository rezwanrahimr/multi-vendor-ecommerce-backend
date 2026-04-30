import { IsString } from 'class-validator';

export class CreateHomeBannerDto {
  @IsString()
  redirectLink: string;
}
