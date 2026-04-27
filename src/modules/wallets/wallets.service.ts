import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WithdrawRequestDto } from './dto/withdraw-request.dto';

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  findVendorWallet(vendorId: string) {
    return this.prisma.wallet.upsert({
      where: { vendorId },
      update: {},
      create: { vendorId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        withdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  findAll() {
    return this.prisma.wallet.findMany({
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async requestWithdrawal(vendorId: string, dto: WithdrawRequestDto) {
    const vendor = await this.prisma.user.findUniqueOrThrow({
      where: { id: vendorId },
      select: { id: true, role: true },
    });

    if (vendor.role !== UserRole.VENDOR) {
      throw new BadRequestException('Only vendors can request wallet withdrawals');
    }

    const wallet = await this.prisma.wallet.upsert({
      where: { vendorId },
      update: {},
      create: { vendorId },
    });

    if (new Prisma.Decimal(wallet.balance).lt(dto.amount)) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          walletId: wallet.id,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          accountNumber: dto.accountNumber,
          note: dto.note,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: dto.amount },
          pendingBalance: { increment: dto.amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.WITHDRAWAL,
          amount: dto.amount,
          reference: withdrawal.id,
          reason: 'Withdrawal requested',
        },
      });

      return withdrawal;
    });
  }
}
