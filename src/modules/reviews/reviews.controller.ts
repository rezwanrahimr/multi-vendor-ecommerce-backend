import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user.type';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Product Reviews')
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.id, productId, dto);
  }

  @Get()
  findByProduct(@Param('productId') productId: string) {
    return this.reviewsService.findPublicByProduct(productId);
  }
}

@ApiTags('Product Rating Summary')
@Controller('products/:productId/rating-summary')
export class ProductRatingSummaryController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  getSummary(@Param('productId') productId: string) {
    return this.reviewsService.getRatingSummary(productId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@ApiTags('Customer Reviews')
@Controller('customer/reviews')
export class CustomerReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.reviewsService.findCustomerReviews(user.id);
  }

  @Patch(':id')
  updateMine(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateCustomerReview(user.id, id, dto);
  }

  @Delete(':id')
  removeMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reviewsService.removeCustomerReview(user.id, id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Reviews')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  findAll() {
    return this.reviewsService.findAll();
  }

  @Patch(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reviewsService.approve(id, user.id);
  }

  @Patch(':id/hide')
  hide(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reviewsService.hide(id, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reviewsService.remove(id, user.id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@ApiTags('Vendor Reviews')
@Controller('vendor/reviews')
export class VendorReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.reviewsService.findVendorReviews(user.id);
  }
}
