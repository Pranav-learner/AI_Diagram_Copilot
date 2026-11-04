import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { Logo, ThemeToggle, UserMenu } from '@/components/common';
import { Button } from '@/components/ui/button';
import { SoftwareIntelligenceWorkspace, AIGenerationContext, createEditorAIService } from '@/features/ai';

export function IntelligencePage() {
  const contextValue = useMemo(() => {
    const bundle = createEditorAIService();
    return {
      service: bundle.service,
      metrics: bundle.metrics,
      provider: bundle.providerId,
      model: bundle.model,
      usingMock: bundle.usingMock,
      availableProviders: bundle.availableProviders,
    } as any;
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Go to dashboard"
          >
            <Logo />
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Phase 5 & 6
            </span>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              Software Intelligence Engine & Autonomous AI
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/">
              <Layers className="size-3.5" />
              Diagram Workspace
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      {/* Main Software Intelligence Workspace */}
      <main className="relative flex-1 overflow-hidden">
        <AIGenerationContext.Provider value={contextValue}>
          <SoftwareIntelligenceWorkspace />
        </AIGenerationContext.Provider>
      </main>
    </div>
  );
}

export default IntelligencePage;
