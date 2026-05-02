import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { UpdateVendorStoreDto } from './dto/update-vendor-store.dto';
import { VendorsService } from './vendors.service';

const STORE_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

type StoreUploadFiles = {
  logo?: Array<{ buffer: Buffer; mimetype?: string }>;
  banner?: Array<{ buffer: Buffer; mimetype?: string }>;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@ApiTags('Vendor Store')
@Controller('vendor/store')
export class VendorStoreController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  findMyStore(@CurrentUser() user: AuthUser) {
    return this.vendorsService.findMyStore(user.id);
  }

  @Patch()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: 1 },
      { name: 'banner', maxCount: 1 },
    ], {
      limits: {
        fileSize: STORE_IMAGE_MAX_SIZE,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  updateMyStore(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateVendorStoreDto,
    @UploadedFiles() files?: StoreUploadFiles,
  ) {
    return this.vendorsService.updateMyStore(user.id, dto, {
      logo: files?.logo?.[0],
      banner: files?.banner?.[0],
    });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Vendors')
@Controller('admin/vendors')
export class AdminVendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.vendorsService.findAll({ page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.vendorsService.approve(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.vendorsService.reject(id);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.vendorsService.suspend(id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.vendorsService.activate(id);
  }
}
