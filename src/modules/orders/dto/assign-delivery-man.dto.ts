import { IsUUID } from 'class-validator';

export class AssignDeliveryManDto {
  @IsUUID()
  deliveryManId: string;
}
