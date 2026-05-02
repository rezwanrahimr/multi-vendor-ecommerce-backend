import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AdminCouponsController, CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [AdminCouponsController, CouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
