import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CouponsService } from './coupons.service';
import { CouponQueryDto } from './dto/coupon-query.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Coupons')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(
    private readonly couponsService: CouponsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCouponDto) {
    const coupon = await this.couponsService.create(dto);

    await this.auditLogsService.log({
      actorId: user.id,
      action: 'COUPON_CREATED',
      entityType: 'Coupon',
      entityId: coupon.id,
      metadata: { code: coupon.code, discountType: coupon.discountType },
    });

    return coupon;
  }

  @Get()
  findAll(@Query() query: CouponQueryDto) {
    return this.couponsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.couponsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    const coupon = await this.couponsService.update(id, dto);

    await this.auditLogsService.log({
      actorId: user.id,
      action: 'COUPON_UPDATED',
      entityType: 'Coupon',
      entityId: id,
      metadata: { code: coupon.code },
    });

    return coupon;
  }

  @Patch(':id/activate')
  async activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const coupon = await this.couponsService.activate(id);

    await this.auditLogsService.log({
      actorId: user.id,
      action: 'COUPON_ACTIVATED',
      entityType: 'Coupon',
      entityId: id,
      metadata: { code: coupon.code },
    });

    return coupon;
  }

  @Patch(':id/deactivate')
  async deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const coupon = await this.couponsService.deactivate(id);

    await this.auditLogsService.log({
      actorId: user.id,
      action: 'COUPON_DEACTIVATED',
      entityType: 'Coupon',
      entityId: id,
      metadata: { code: coupon.code },
    });

    return coupon;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.couponsService.remove(id);
  }
}

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get('active')
  findActive() {
    return this.couponsService.findActive();
  }
}
