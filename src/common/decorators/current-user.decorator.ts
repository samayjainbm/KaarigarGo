import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';

/**
 * Injects the authenticated user (set by JwtAuthGuard).
 * Use `@CurrentUser()` for the whole object or `@CurrentUser('id')` for a field.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    return data ? user?.[data] : user;
  },
);
