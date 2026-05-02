import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  NotificationType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(customerId: string, productId: string, dto: CreateReviewDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { id: true, vendorId: true, name: true },
      });

      if (product.vendorId === customerId) {
        throw new ForbiddenException('Vendor cannot review own product');
      }

      const order = await tx.order.findFirst({
        where: { id: dto.orderId, customerId },
        include: {
          items: {
            where: { productId },
            select: { id: true },
          },
        },
      });

      if (!order) {
        throw new BadRequestException('Order was not found for this customer');
      }

      if (order.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException('Order must be delivered before review');
      }

      if (order.paymentStatus !== PaymentStatus.PAID) {
        throw new BadRequestException('Order payment must be paid before review');
      }

      if (order.items.length < 1) {
        throw new BadRequestException('Order does not contain this product');
      }

      const duplicate = await tx.review.findFirst({
        where: {
          orderId: dto.orderId,
          productId,
          customerId,
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('Product was already reviewed for this order');
      }

      const review = await tx.review.create({
        data: {
          productId,
          orderId: dto.orderId,
          customerId,
          rating: dto.rating,
          comment: dto.comment,
          images: dto.images ?? [],
          status: ReviewStatus.PENDING,
        },
        include: this.defaultInclude(),
      });

      await this.notificationsService.create(
        {
          userId: product.vendorId,
          title: 'New product review',
          message: `${product.name} received a new review.`,
          type: NotificationType.REVIEW_CREATED,
          data: {
            reviewId: review.id,
            productId,
            orderId: dto.orderId,
          },
        },
        tx,
      );

      return review;
    });
  }

  findCustomerReviews(customerId: string) {
    return this.prisma.review.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  findPublicByProduct(productId: string) {
    return this.prisma.review.findMany({
      where: { productId, status: ReviewStatus.PUBLISHED },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  async getRatingSummary(productId: string) {
    const [summary, breakdown] = await this.prisma.$transaction([
      this.prisma.review.aggregate({
        where: { productId, status: ReviewStatus.PUBLISHED },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId, status: ReviewStatus.PUBLISHED },
        _count: { _all: true },
        orderBy: { rating: 'desc' },
      }),
    ]);

    return {
      productId,
      avgRating: Number((summary._avg.rating ?? 0).toFixed(2)),
      reviewsCount: summary._count.rating,
      breakdown: breakdown.map((item) => ({
        rating: item.rating,
        count:
          (item._count as { _all?: number } | undefined)?._all ?? 0,
      })),
    };
  }

  findAll() {
    return this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  findVendorReviews(vendorId: string) {
    return this.prisma.review.findMany({
      where: {
        product: {
          vendorId,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  async updateCustomerReview(
    customerId: string,
    id: string,
    dto: UpdateReviewDto,
  ) {
    const review = await this.prisma.review.findFirstOrThrow({
      where: { id, customerId },
      select: { productId: true, status: true },
    });

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        rating: dto.rating,
        comment: dto.comment,
        images: dto.images,
        status:
          review.status === ReviewStatus.PUBLISHED
            ? ReviewStatus.PENDING
            : undefined,
      },
      include: this.defaultInclude(),
    });

    if (review.status === ReviewStatus.PUBLISHED) {
      await this.recalculateProductRating(review.productId);
    }

    return updated;
  }

  async removeCustomerReview(customerId: string, id: string) {
    const review = await this.prisma.review.findFirstOrThrow({
      where: { id, customerId },
      select: { productId: true, status: true },
    });

    const deleted = await this.prisma.review.delete({
      where: { id },
      include: this.defaultInclude(),
    });

    if (review.status === ReviewStatus.PUBLISHED) {
      await this.recalculateProductRating(review.productId);
    }

    return deleted;
  }

  approve(id: string, actorId?: string) {
    return this.setStatus(id, ReviewStatus.PUBLISHED, actorId, 'REVIEW_APPROVED');
  }

  hide(id: string, actorId?: string) {
    return this.setStatus(id, ReviewStatus.HIDDEN, actorId, 'REVIEW_HIDDEN');
  }

  async remove(id: string, actorId?: string) {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.delete({
        where: { id },
        include: this.defaultInclude(),
      });

      await this.auditLogsService.log(
        {
          actorId,
          action: 'REVIEW_DELETED',
          entityType: 'Review',
          entityId: id,
          metadata: {
            productId: review.productId,
            customerId: review.customerId,
            orderId: review.orderId,
            status: review.status,
          },
        },
        tx,
      );

      return review;
    });

    await this.recalculateProductRating(deleted.productId);

    return deleted;
  }

  private async setStatus(
    id: string,
    status: ReviewStatus,
    actorId?: string,
    action?: string,
  ) {
    const review = await this.prisma.$transaction(async (tx) => {
      const current = await tx.review.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          productId: true,
          customerId: true,
          orderId: true,
        },
      });
      const updated = await tx.review.update({
        where: { id },
        data: { status },
        include: this.defaultInclude(),
      });

      if (action) {
        await this.auditLogsService.log(
          {
            actorId,
            action,
            entityType: 'Review',
            entityId: id,
            metadata: {
              productId: current.productId,
              customerId: current.customerId,
              orderId: current.orderId,
              from: current.status,
              to: status,
            },
          },
          tx,
        );
      }

      if (status === ReviewStatus.PUBLISHED || status === ReviewStatus.HIDDEN) {
        await this.notificationsService.create(
          {
            userId: current.customerId,
            title:
              status === ReviewStatus.PUBLISHED
                ? 'Review approved'
                : 'Review hidden',
            message:
              status === ReviewStatus.PUBLISHED
                ? 'Your review has been approved.'
                : 'Your review has been hidden after moderation.',
            type: NotificationType.REVIEW_CREATED,
            data: { reviewId: id, productId: current.productId },
          },
          tx,
        );
      }

      return updated;
    });

    await this.recalculateProductRating(review.productId);

    return review;
  }

  private async recalculateProductRating(productId: string) {
    const summary = await this.prisma.review.aggregate({
      where: { productId, status: ReviewStatus.PUBLISHED },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        avgRating: new Prisma.Decimal(summary._avg.rating ?? 0).toDecimalPlaces(2),
        reviewsCount: summary._count.rating,
      },
    });
  }

  private defaultInclude() {
    return {
      customer: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      order: {
        select: {
          id: true,
          orderNumber: true,
        },
      },
    } as const;
  }
}
