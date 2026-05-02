import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ImagesUploadPipe,
  UploadedImageFile,
} from '../../common/pipes/images-upload.pipe';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

const PRODUCT_IMAGE_LIMITS = {
  maxFiles: 3,
  maxSizeInBytes: 5 * 1024 * 1024,
};

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Post()
  @UseInterceptors(
    FilesInterceptor('images', PRODUCT_IMAGE_LIMITS.maxFiles, {
      limits: {
        files: PRODUCT_IMAGE_LIMITS.maxFiles,
        fileSize: PRODUCT_IMAGE_LIMITS.maxSizeInBytes,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'price', 'images'],
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        price: { type: 'number', minimum: 0.01 },
        discountPrice: { type: 'number', minimum: 0 },
        stock: { type: 'integer', minimum: 0 },
        sku: { type: 'string' },
        status: {
          type: 'string',
          enum: [
            'DRAFT',
            'PENDING_REVIEW',
            'ACTIVE',
            'INACTIVE',
            'REJECTED',
            'OUT_OF_STOCK',
          ],
        },
        storeId: { type: 'string', format: 'uuid' },
        categoryId: { type: 'string', format: 'uuid' },
        images: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductDto,
    @UploadedFiles(
      new ImagesUploadPipe({
        minFiles: 1,
        maxFiles: PRODUCT_IMAGE_LIMITS.maxFiles,
        maxSizeInBytes: PRODUCT_IMAGE_LIMITS.maxSizeInBytes,
        fieldName: 'images',
      }),
    )
    images: UploadedImageFile[],
  ) {
    return this.productsService.create(user.id, user.role, dto, images);
  }

  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findPublicAll(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/me')
  findMine(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.productsService.findForVendor(user.id, query);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findPublicBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findPublicOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Patch(':id')
  @UseInterceptors(
    FilesInterceptor('images', PRODUCT_IMAGE_LIMITS.maxFiles, {
      limits: {
        files: PRODUCT_IMAGE_LIMITS.maxFiles,
        fileSize: PRODUCT_IMAGE_LIMITS.maxSizeInBytes,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        price: { type: 'number', minimum: 0.01 },
        discountPrice: { type: 'number', minimum: 0, nullable: true },
        stock: { type: 'integer', minimum: 0 },
        sku: { type: 'string' },
        status: {
          type: 'string',
          enum: [
            'DRAFT',
            'PENDING_REVIEW',
            'ACTIVE',
            'INACTIVE',
            'REJECTED',
            'OUT_OF_STOCK',
          ],
        },
        categoryId: { type: 'string', format: 'uuid' },
        images: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles(
      new ImagesUploadPipe({
        minFiles: 0,
        maxFiles: PRODUCT_IMAGE_LIMITS.maxFiles,
        maxSizeInBytes: PRODUCT_IMAGE_LIMITS.maxSizeInBytes,
        fieldName: 'images',
      }),
    )
    images: UploadedImageFile[],
  ) {
    return this.productsService.update(id, dto, user.id, user.role, images);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.remove(id, user.id, user.role);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@ApiTags('Vendor Products')
@Controller('vendor/products')
export class VendorProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('images', PRODUCT_IMAGE_LIMITS.maxFiles, {
      limits: {
        files: PRODUCT_IMAGE_LIMITS.maxFiles,
        fileSize: PRODUCT_IMAGE_LIMITS.maxSizeInBytes,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductDto,
    @UploadedFiles(
      new ImagesUploadPipe({
        minFiles: 1,
        maxFiles: PRODUCT_IMAGE_LIMITS.maxFiles,
        maxSizeInBytes: PRODUCT_IMAGE_LIMITS.maxSizeInBytes,
        fieldName: 'images',
      }),
    )
    images: UploadedImageFile[],
  ) {
    return this.productsService.create(user.id, user.role, dto, images);
  }

  @Get()
  findMine(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.productsService.findForVendor(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.findVendorOne(id, user.id);
  }

  @Patch(':id')
  @UseInterceptors(
    FilesInterceptor('images', PRODUCT_IMAGE_LIMITS.maxFiles, {
      limits: {
        files: PRODUCT_IMAGE_LIMITS.maxFiles,
        fileSize: PRODUCT_IMAGE_LIMITS.maxSizeInBytes,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles(
      new ImagesUploadPipe({
        minFiles: 0,
        maxFiles: PRODUCT_IMAGE_LIMITS.maxFiles,
        maxSizeInBytes: PRODUCT_IMAGE_LIMITS.maxSizeInBytes,
        fieldName: 'images',
      }),
    )
    images: UploadedImageFile[],
  ) {
    return this.productsService.update(id, dto, user.id, user.role, images);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.remove(id, user.id, user.role);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Products')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.productsService.approve(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.productsService.reject(id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.productsService.activate(id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.productsService.deactivate(id);
  }
}
