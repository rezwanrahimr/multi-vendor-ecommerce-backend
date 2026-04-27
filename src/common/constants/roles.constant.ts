import { UserRole } from '@prisma/client';

export const ADMIN_ROLES = [UserRole.ADMIN];
export const VENDOR_ROLES = [UserRole.ADMIN, UserRole.VENDOR];
export const DELIVERY_ROLES = [UserRole.ADMIN, UserRole.DELIVERY_MAN];
export const CUSTOMER_ROLES = [UserRole.ADMIN, UserRole.CUSTOMER];
