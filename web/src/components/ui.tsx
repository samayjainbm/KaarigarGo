'use client';

import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/* ─── Button ─────────────────────────────────────────────────────────────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  const variants: Record<Variant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-soft',
    secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    accent: 'bg-accent-500 text-white hover:bg-accent-600 shadow-soft',
  };
  const sizes: Record<Size, string> = {
    sm: 'h-9 px-3.5 text-sm',
    md: 'h-11 px-5 text-sm',
    lg: 'h-12 px-6 text-base',
  };
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ─── Input ──────────────────────────────────────────────────────────────── */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-brand-400',
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/* ─── Card ───────────────────────────────────────────────────────────────── */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card p-5', className)}>{children}</div>;
}

/* ─── Badge / StatusBadge ────────────────────────────────────────────────── */
export function Badge({ tone = 'slate', children }: { tone?: string; children: ReactNode }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-sky-50 text-sky-700',
  };
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  REQUESTED: 'amber',
  ACCEPTED: 'blue',
  EN_ROUTE: 'blue',
  IN_PROGRESS: 'brand',
  COMPLETED: 'green',
  SETTLED: 'green',
  REJECTED: 'rose',
  CANCELLED_BY_CUSTOMER: 'rose',
  CANCELLED_BY_WORKER: 'rose',
  EXPIRED: 'slate',
  DISPUTED: 'rose',
  PENDING: 'amber',
  APPROVED: 'green',
  ONLINE: 'green',
  OFFLINE: 'slate',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'slate'}>{status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

/* ─── Misc ───────────────────────────────────────────────────────────────── */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-500', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ name, src, size = 40 }: { name?: string | null; src?: string | null; size?: number }) {
  const text = (name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src ? <img src={src} alt={name ?? ''} className="h-full w-full rounded-full object-cover" /> : text}
    </div>
  );
}
