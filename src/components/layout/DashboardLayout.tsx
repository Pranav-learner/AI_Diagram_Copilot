import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Layers, Database, Sparkles } from 'lucide-react';
import { Logo, ThemeToggle, UserMenu } from '@/components/common';

interface DashboardLayoutProps {
  children: ReactNode;
}

/** App chrome for the dashboard: a sticky top bar plus a contained main area. */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const isIntelligence = location.pathname === '/intelligence';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Go to dashboard"
            >
              <Logo />
            </Link>

            <nav className="flex items-center gap-1.5 text-sm font-medium">
              <Link
                to="/"
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                  !isIntelligence
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <Layers className="size-4" />
                Diagrams
              </Link>

              <Link
                to="/intelligence"
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                  isIntelligence
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-primary hover:bg-primary/10'
                }`}
              >
                <Database className="size-4 text-primary" />
                Software Intelligence
                <span className="flex items-center gap-0.5 rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                  <Sparkles className="size-2.5" />
                  AI
                </span>
              </Link>
            </nav>
          </div>

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
