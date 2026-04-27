import { IsString } from 'class-validator';

export class AssignDeliveryManDto {
  @IsString()
  deliveryManId: string;
}
