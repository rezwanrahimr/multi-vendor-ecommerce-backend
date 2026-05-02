import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  UserRole,
  WalletTransactionType,
  WithdrawalStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildPaginationMeta,
  getPagination,
} from '../../utils/pagination.util';
import { CreatePayoutRequestDto } from './dto/create-payout-request.dto';
import { MarkPayoutPaidDto } from './dto/mark-payout-paid.dto';
import { PayoutQueryDto } from './dto/payout-query.dto';
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { WalletQueryDto } from './dto/wallet-query.dto';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto';

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async settleOrderVendorEarnings(orderId: string, actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          items: {
            select: {
              vendorId: true,
              storeId: true,
              vendorEarning: true,
              commissionAmount: true,
            },
          },
        },
      });

      if (order.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException('Order must be delivered before settlement');
      }

      if (order.paymentStatus !== PaymentStatus.PAID) {
        throw new BadRequestException('Order payment must be paid before settlement');
      }

      const earningsByVendor = new Map<
        string,
        {
          vendorId: string;
          storeIds: Set<string>;
          vendorEarning: Prisma.Decimal;
          commissionAmount: Prisma.Decimal;
        }
      >();

      for (const item of order.items) {
        const current =
          earningsByVendor.get(item.vendorId) ??
          {
            vendorId: item.vendorId,
            storeIds: new Set<string>(),
            vendorEarning: new Prisma.Decimal(0),
            commissionAmount: new Prisma.Decimal(0),
          };

        current.storeIds.add(item.storeId);
        current.vendorEarning = current.vendorEarning.add(item.vendorEarning);
        current.commissionAmount = current.commissionAmount.add(
          item.commissionAmount,
        );
        earningsByVendor.set(item.vendorId, current);
      }

      const settled = [];
      const skipped = [];

      for (const summary of earningsByVendor.values()) {
        const wallet = await tx.wallet.upsert({
          where: { vendorId: summary.vendorId },
          update: {},
          create: { vendorId: summary.vendorId },
        });
        const existingSettlement = await tx.walletTransaction.findFirst({
          where: {
            walletId: wallet.id,
            type: WalletTransactionType.ORDER_EARNING,
            orderId,
          },
          select: { id: true },
        });

        if (existingSettlement) {
          skipped.push({
            vendorId: summary.vendorId,
            reason: 'Already settled',
            walletTransactionId: existingSettlement.id,
          });
          continue;
        }

        if (summary.vendorEarning.lte(0)) {
          skipped.push({
            vendorId: summary.vendorId,
            reason: 'No vendor earning to settle',
          });
          continue;
        }

        const balanceBefore = new Prisma.Decimal(wallet.balance);
        const balanceAfter = balanceBefore.add(summary.vendorEarning);

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: summary.vendorEarning },
            totalEarned: { increment: summary.vendorEarning },
          },
        });

        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            orderId,
            type: WalletTransactionType.ORDER_EARNING,
            amount: summary.vendorEarning,
            balanceBefore,
            balanceAfter,
            reference: orderId,
            note: 'Order delivered and paid vendor earning',
            metadata: {
              orderId,
              vendorId: summary.vendorId,
              storeIds: Array.from(summary.storeIds),
              commissionAmount: summary.commissionAmount.toNumber(),
            },
          },
        });

        settled.push({
          vendorId: summary.vendorId,
          storeIds: Array.from(summary.storeIds),
          vendorEarning: summary.vendorEarning.toDecimalPlaces(2).toNumber(),
          commissionAmount: summary.commissionAmount.toDecimalPlaces(2).toNumber(),
          walletTransactionId: transaction.id,
        });
      }

      if (settled.length > 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { vendorSettledAt: new Date() },
        });

        await this.auditLogsService.log(
          {
            actorId,
            action: 'WALLET_SETTLED',
            entityType: 'Order',
            entityId: orderId,
            metadata: { settled },
          },
          tx,
        );
      }

      return {
        orderId,
        settled,
        skipped,
        message:
          settled.length > 0
            ? 'Wallet settlement completed'
            : 'No new vendor earnings were settled',
      };
    });
  }

  async findVendorWallet(vendorId: string) {
    const wallet = await this.prisma.wallet.upsert({
      where: { vendorId },
      update: {},
      create: { vendorId },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            store: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        withdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return this.toWalletSummary(wallet);
  }

  async findVendorTransactions(vendorId: string, query: WalletTransactionQueryDto) {
    const wallet = await this.findWalletForVendor(vendorId);
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.WalletTransactionWhereInput = {
      walletId: wallet.id,
      type: query.type,
      createdAt: query.date ? this.dateFilter(query.date) : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findAllWallets(query: WalletQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.WalletWhereInput = {
      vendorId: query.vendorId,
      balance: query.minBalance ? { gte: query.minBalance } : undefined,
      vendor: query.storeId
        ? {
            store: {
              id: query.storeId,
            },
          }
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.wallet.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { updatedAt: 'desc' },
        include: this.walletInclude(),
      }),
      this.prisma.wallet.count({ where }),
    ]);

    return {
      data: data.map((wallet) => this.toWalletSummary(wallet)),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async findAdminWallet(vendorId: string) {
    const wallet = await this.prisma.wallet.upsert({
      where: { vendorId },
      update: {},
      create: { vendorId },
      include: this.walletInclude(),
    });

    return this.toWalletSummary(wallet);
  }

  async requestPayout(vendorId: string, dto: CreatePayoutRequestDto) {
    await this.assertVendor(vendorId);

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { vendorId },
        update: {},
        create: { vendorId },
      });
      const amount = new Prisma.Decimal(dto.amount);

      if (amount.lte(0)) {
        throw new BadRequestException('Payout amount must be greater than 0');
      }

      if (new Prisma.Decimal(wallet.balance).lt(amount)) {
        throw new BadRequestException('Insufficient available wallet balance');
      }

      const balanceBefore = new Prisma.Decimal(wallet.balance);
      const balanceAfter = balanceBefore.sub(amount);
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          walletId: wallet.id,
          amount,
          paymentMethod: dto.method,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          note: dto.note,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: amount },
          pendingBalance: { increment: amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          withdrawalRequestId: withdrawal.id,
          type: WalletTransactionType.PAYOUT_REQUEST,
          amount,
          balanceBefore,
          balanceAfter,
          reference: withdrawal.id,
          note: 'Payout requested and amount moved to pending',
        },
      });

      await this.notificationsService.create(
        {
          userId: vendorId,
          title: 'Payout requested',
          message: 'Your payout request has been submitted.',
          type: NotificationType.PAYOUT_REQUESTED,
          data: { payoutId: withdrawal.id, amount: amount.toNumber() },
        },
        tx,
      );

      return withdrawal;
    });
  }

  findVendorPayouts(vendorId: string, query: PayoutQueryDto) {
    return this.findPayouts({
      ...query,
      vendorId,
    });
  }

  async findVendorPayout(vendorId: string, id: string) {
    const payout = await this.prisma.withdrawalRequest.findFirst({
      where: {
        id,
        wallet: { vendorId },
      },
      include: this.payoutInclude(),
    });

    if (!payout) {
      throw new NotFoundException('Payout request was not found');
    }

    return payout;
  }

  findAllPayouts(query: PayoutQueryDto) {
    return this.findPayouts(query);
  }

  findPayout(id: string) {
    return this.prisma.withdrawalRequest.findUniqueOrThrow({
      where: { id },
      include: this.payoutInclude(),
    });
  }

  approvePayout(id: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.withdrawalRequest.findUniqueOrThrow({
        where: { id },
      });

      if (payout.status !== WithdrawalStatus.PENDING) {
        throw new BadRequestException('Only pending payout requests can be approved');
      }

      const updated = await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.APPROVED,
          approvedById: adminId,
          adminNote: 'Approved for payment',
        },
        include: this.payoutInclude(),
      });

      await this.notificationsService.create(
        {
          userId: updated.wallet.vendorId,
          title: 'Payout approved',
          message: 'Your payout request has been approved.',
          type: NotificationType.PAYOUT_APPROVED,
          data: { payoutId: id },
        },
        tx,
      );

      await this.auditLogsService.log(
        {
          actorId: adminId,
          action: 'PAYOUT_APPROVED',
          entityType: 'WithdrawalRequest',
          entityId: id,
          metadata: { amount: updated.amount.toNumber() },
        },
        tx,
      );

      return updated;
    });
  }

  rejectPayout(id: string, adminId: string, dto: RejectPayoutDto) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.withdrawalRequest.findUniqueOrThrow({
        where: { id },
        include: { wallet: true },
      });

      if (
        !(
          [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED] as WithdrawalStatus[]
        ).includes(payout.status)
      ) {
        throw new BadRequestException('This payout request cannot be rejected');
      }

      await this.refundHeldPayout(tx, payout, dto.reason);

      const updated = await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.REJECTED,
          approvedById: adminId,
          adminNote: dto.reason,
        },
        include: this.payoutInclude(),
      });

      await this.notificationsService.create(
        {
          userId: updated.wallet.vendorId,
          title: 'Payout rejected',
          message: 'Your payout request has been rejected.',
          type: NotificationType.PAYOUT_REJECTED,
          data: { payoutId: id },
        },
        tx,
      );

      await this.auditLogsService.log(
        {
          actorId: adminId,
          action: 'PAYOUT_REJECTED',
          entityType: 'WithdrawalRequest',
          entityId: id,
          metadata: { reason: dto.reason },
        },
        tx,
      );

      return updated;
    });
  }

  markPayoutPaid(id: string, adminId: string, dto: MarkPayoutPaidDto) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.withdrawalRequest.findUniqueOrThrow({
        where: { id },
        include: { wallet: true },
      });

      if (payout.status !== WithdrawalStatus.APPROVED) {
        throw new BadRequestException('Only approved payout requests can be marked paid');
      }

      const existingPaidTransaction = await tx.walletTransaction.findFirst({
        where: {
          walletId: payout.walletId,
          type: WalletTransactionType.PAYOUT_PAID,
          withdrawalRequestId: payout.id,
        },
        select: { id: true },
      });

      if (existingPaidTransaction) {
        throw new ConflictException('This payout has already been marked paid');
      }

      const balance = new Prisma.Decimal(payout.wallet.balance);
      await tx.wallet.update({
        where: { id: payout.walletId },
        data: {
          pendingBalance: { decrement: payout.amount },
          totalWithdrawn: { increment: payout.amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: payout.walletId,
          withdrawalRequestId: payout.id,
          type: WalletTransactionType.PAYOUT_PAID,
          amount: payout.amount,
          balanceBefore: balance,
          balanceAfter: balance,
          reference: dto.transactionId ?? payout.id,
          note: dto.adminNote ?? 'Payout marked paid',
        },
      });

      const updated = await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.PAID,
          approvedById: adminId,
          paidAt: new Date(),
          payoutTransactionId: dto.transactionId,
          adminNote: dto.adminNote,
        },
        include: this.payoutInclude(),
      });

      await this.notificationsService.create(
        {
          userId: updated.wallet.vendorId,
          title: 'Payout paid',
          message: 'Your payout request has been marked paid.',
          type: NotificationType.PAYOUT_PAID,
          data: { payoutId: id, transactionId: dto.transactionId },
        },
        tx,
      );

      await this.auditLogsService.log(
        {
          actorId: adminId,
          action: 'PAYOUT_PAID',
          entityType: 'WithdrawalRequest',
          entityId: id,
          metadata: { transactionId: dto.transactionId },
        },
        tx,
      );

      return updated;
    });
  }

  private async findPayouts(query: PayoutQueryDto) {
    const pagination = getPagination({ page: query.page, limit: query.limit });
    const where: Prisma.WithdrawalRequestWhereInput = {
      status: query.status,
      wallet: query.vendorId ? { vendorId: query.vendorId } : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.withdrawalRequest.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: this.payoutInclude(),
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  private async refundHeldPayout(
    tx: Prisma.TransactionClient,
    payout: {
      id: string;
      walletId: string;
      amount: Prisma.Decimal;
      wallet: { balance: Prisma.Decimal; pendingBalance: Prisma.Decimal };
    },
    reason: string,
  ) {
    const existingRefund = await tx.walletTransaction.findFirst({
      where: {
        walletId: payout.walletId,
        type: WalletTransactionType.PAYOUT_REJECTED,
        withdrawalRequestId: payout.id,
      },
      select: { id: true },
    });

    if (existingRefund) {
      throw new ConflictException('This payout has already been refunded');
    }

    if (new Prisma.Decimal(payout.wallet.pendingBalance).lt(payout.amount)) {
      throw new BadRequestException('Held payout balance is insufficient');
    }

    const balanceBefore = new Prisma.Decimal(payout.wallet.balance);
    const balanceAfter = balanceBefore.add(payout.amount);

    await tx.wallet.update({
      where: { id: payout.walletId },
      data: {
        balance: { increment: payout.amount },
        pendingBalance: { decrement: payout.amount },
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: payout.walletId,
        withdrawalRequestId: payout.id,
        type: WalletTransactionType.PAYOUT_REJECTED,
        amount: payout.amount,
        balanceBefore,
        balanceAfter,
        reference: payout.id,
        note: reason,
      },
    });
  }

  private async assertVendor(vendorId: string) {
    const vendor = await this.prisma.user.findFirst({
      where: { id: vendorId, role: UserRole.VENDOR },
      select: { id: true },
    });

    if (!vendor) {
      throw new BadRequestException('Only vendors can use wallet payouts');
    }
  }

  private async findWalletForVendor(vendorId: string) {
    return this.prisma.wallet.upsert({
      where: { vendorId },
      update: {},
      create: { vendorId },
    });
  }

  private walletInclude() {
    return {
      vendor: {
        select: {
          id: true,
          name: true,
          email: true,
          store: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      withdrawals: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    } as const;
  }

  private payoutInclude() {
    return {
      wallet: {
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              store: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
      approvedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    } as const;
  }

  private toWalletSummary(wallet: {
    id: string;
    vendorId: string;
    balance: Prisma.Decimal;
    pendingBalance: Prisma.Decimal;
    totalEarned: Prisma.Decimal;
    totalWithdrawn: Prisma.Decimal;
    vendor?: unknown;
    transactions?: unknown;
    withdrawals?: unknown;
  }) {
    return {
      ...wallet,
      availableBalance: new Prisma.Decimal(wallet.balance).toNumber(),
      pendingBalance: new Prisma.Decimal(wallet.pendingBalance).toNumber(),
      totalEarned: new Prisma.Decimal(wallet.totalEarned).toNumber(),
      totalWithdrawn: new Prisma.Decimal(wallet.totalWithdrawn).toNumber(),
    };
  }

  private dateFilter(date: string): Prisma.DateTimeFilter {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    return { gte: start, lt: end };
  }
}
