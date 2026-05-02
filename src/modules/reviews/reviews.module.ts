import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AdminReviewsController,
  CustomerReviewsController,
  ProductRatingSummaryController,
  ProductReviewsController,
  VendorReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [NotificationsModule, AuditLogsModule],
  controllers: [
    ProductReviewsController,
    ProductRatingSummaryController,
    CustomerReviewsController,
    AdminReviewsController,
    VendorReviewsController,
  ],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
