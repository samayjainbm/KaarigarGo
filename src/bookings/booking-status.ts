import { BookingStatus } from '@prisma/client';

/** Allowed worker-driven forward transitions. */
const WORKER_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  ACCEPTED: ['EN_ROUTE'],
  EN_ROUTE: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
};

export const TERMINAL_STATUSES: BookingStatus[] = [
  'COMPLETED',
  'SETTLED',
  'REJECTED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_WORKER',
  'EXPIRED',
];

export function canWorkerTransition(from: BookingStatus, to: BookingStatus): boolean {
  return (WORKER_TRANSITIONS[from] ?? []).includes(to);
}
