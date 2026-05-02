import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CommissionPreviewDto {
  @IsUUID()
  vendorId: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsNumber()
  @Min(0.01)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}
