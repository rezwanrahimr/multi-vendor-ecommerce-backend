import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsUUID,
} from 'class-validator';

export enum AdminProductBulkAction {
  ACTIVATE = 'ACTIVATE',
  APPROVE = 'APPROVE',
  DEACTIVATE = 'DEACTIVATE',
  DELETE = 'DELETE',
  REJECT = 'REJECT',
}

export class AdminProductBulkActionDto {
  @IsEnum(AdminProductBulkAction)
  action: AdminProductBulkAction;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Type(() => String)
  @IsUUID('4', { each: true })
  productIds: string[];
}
