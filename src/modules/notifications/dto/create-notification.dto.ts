import { NotificationType } from '@prisma/client';

export type CreateNotificationDto = {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  data?: Record<string, unknown>;
};
