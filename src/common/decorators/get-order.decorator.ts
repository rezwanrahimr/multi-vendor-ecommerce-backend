import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithUser } from '../types/auth-user.type';

export const GetOrder = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  const order = request.order as Record<string, unknown> | undefined;

  return data && order ? order[data] : order;
});
