import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo, ThemeToggle, UserMenu } from '@/components/common';

interface DashboardLayoutProps {
  children: ReactNode;
}

/** App chrome for the dashboard: a sticky top bar plus a contained main area. */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4">
          <Link
            to="/"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Go to dashboard"
          >
            <Logo />
          </Link>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="container flex-1 py-6 sm:py-8">{children}</main>
    </div>
  );
}
