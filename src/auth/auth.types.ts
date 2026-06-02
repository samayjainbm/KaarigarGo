import { UserRole } from '@prisma/client';

export interface JwtAccessPayload {
  sub: string;
  role: UserRole;
  type: 'access';
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

/** Shape attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: UserRole;
}
