import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../types/auth-user.type';

export function isAdmin(user: AuthUser) {
  return user.role === UserRole.ADMIN;
}

export function canAccessCustomerResource(user: AuthUser, customerId: string) {
  return isAdmin(user) || (user.role === UserRole.CUSTOMER && user.id === customerId);
}

export function canAccessVendorResource(user: AuthUser, vendorId: string) {
  return isAdmin(user) || (user.role === UserRole.VENDOR && user.id === vendorId);
}

export function canAccessAssignedDelivery(user: AuthUser, deliveryManId: string) {
  return isAdmin(user) || (user.role === UserRole.DELIVERY_MAN && user.id === deliveryManId);
}

export function assertCustomerResourceAccess(user: AuthUser, customerId: string) {
  if (!canAccessCustomerResource(user, customerId)) {
    throw new ForbiddenException('You can only access your own customer resource');
  }
}

export function assertVendorResourceAccess(user: AuthUser, vendorId: string) {
  if (!canAccessVendorResource(user, vendorId)) {
    throw new ForbiddenException('You can only access your own vendor resource');
  }
}

export function assertAssignedDeliveryAccess(user: AuthUser, deliveryManId: string) {
  if (!canAccessAssignedDelivery(user, deliveryManId)) {
    throw new ForbiddenException('You can only access deliveries assigned to you');
  }
}
