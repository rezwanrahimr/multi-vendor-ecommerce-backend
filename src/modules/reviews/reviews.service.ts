import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  create(customerId: string, dto: CreateReviewDto) {
    return this.prisma.review.create({
      data: {
        productId: dto.productId,
        customerId,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: this.defaultInclude(),
    });
  }

  findByProduct(productId: string) {
    return this.prisma.review.findMany({
      where: { productId, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  findAll() {
    return this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  update(id: string, dto: UpdateReviewDto) {
    return this.prisma.review.update({
      where: { id },
      data: dto,
      include: this.defaultInclude(),
    });
  }

  remove(id: string) {
    return this.prisma.review.delete({
      where: { id },
      include: this.defaultInclude(),
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
    } as const;
  }
}
