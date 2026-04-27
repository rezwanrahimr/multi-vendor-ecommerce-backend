import { UserRole } from '@prisma/client';
import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user?: AuthUser;
  order?: unknown;
}
