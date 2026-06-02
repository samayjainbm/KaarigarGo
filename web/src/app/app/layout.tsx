'use client';

import { AppShell } from '@/components/app-shell';
import { CalendarClock, Home, Wallet } from 'lucide-react';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      requireRole="user"
      navItems={[
        { href: '/app', label: 'Home', icon: Home },
        { href: '/app/bookings', label: 'Bookings', icon: CalendarClock },
        { href: '/app/wallet', label: 'Wallet', icon: Wallet },
      ]}
    >
      {children}
    </AppShell>
  );
}
