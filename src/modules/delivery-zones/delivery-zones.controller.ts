import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CalculateDeliveryChargeDto } from './dto/calculate-delivery-charge.dto';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { DeliveryZoneQueryDto } from './dto/delivery-zone-query.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';
import { DeliveryZonesService } from './delivery-zones.service';

@ApiTags('Delivery Zones')
@Controller('delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Get()
  findAll() {
    return this.deliveryZonesService.findPublicAll();
  }

  @Post('calculate-charge')
  calculateCharge(@Body() dto: CalculateDeliveryChargeDto) {
    return this.deliveryZonesService.calculateChargeFromDto(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deliveryZonesService.findPublicOne(id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Delivery Zones')
@Controller('admin/delivery-zones')
export class AdminDeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Post()
  create(@Body() dto: CreateDeliveryZoneDto) {
    return this.deliveryZonesService.create(dto);
  }

  @Get()
  findAll(@Query() query: DeliveryZoneQueryDto) {
    return this.deliveryZonesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deliveryZonesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryZoneDto) {
    return this.deliveryZonesService.update(id, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.deliveryZonesService.activate(id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.deliveryZonesService.deactivate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.deliveryZonesService.remove(id);
  }
}
