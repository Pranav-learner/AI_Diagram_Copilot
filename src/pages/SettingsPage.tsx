import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Grid3x3,
  Languages,
  Monitor,
  Moon,
  Save,
  Sun,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useTheme } from '@/hooks';
import { useSettingsStore } from '@/store';
import type { Theme } from '@/types';
import { APP_NAME, APP_PHASE, APP_VERSION } from '@/utils/appMeta';
import { DashboardLayout } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  soon = false,
  control,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
  soon?: boolean;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{label}</p>
            {soon && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                Soon
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Application settings (`/settings`). */
export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const autosaveEnabled = useSettingsStore((s) => s.autosaveEnabled);
  const setAutosaveEnabled = useSettingsStore((s) => s.setAutosaveEnabled);

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit text-muted-foreground"
          >
            <Link to="/">
              <ArrowLeft />
              Back to dashboard
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your appearance and editor preferences.
          </p>
        </div>

        <SettingsSection title="Appearance">
          <SettingRow
            icon={theme === 'dark' ? Moon : Sun}
            label="Theme"
            description="Choose light, dark, or match your system."
            control={
              <ToggleGroup
                type="single"
                value={theme}
                onValueChange={(v) => v && setTheme(v as Theme)}
                aria-label="Theme"
              >
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    aria-label={label}
                    title={label}
                  >
                    <Icon className="size-4" />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          />
        </SettingsSection>

        <SettingsSection title="Editor">
          <SettingRow
            icon={Save}
            label="Autosave"
            description="Automatically save changes as you edit."
            control={
              <Switch
                checked={autosaveEnabled}
                onCheckedChange={setAutosaveEnabled}
                aria-label="Toggle autosave"
              />
            }
          />
          <SettingRow
            icon={Grid3x3}
            label="Snap to grid"
            description="Align elements to the grid while moving."
            soon
            control={<Switch checked={false} onCheckedChange={() => {}} disabled />}
          />
          <SettingRow
            icon={Languages}
            label="Language"
            description="Interface language."
            soon
            control={
              <span className="text-sm text-muted-foreground">English</span>
            }
          />
        </SettingsSection>

        <SettingsSection title="About">
          <div className="flex flex-col gap-1 px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{APP_NAME}</span>
              <Badge variant="secondary">v{APP_VERSION}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{APP_PHASE}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A polished, offline-first diagram editor. AI features arrive in
              Phase 2.
            </p>
          </div>
        </SettingsSection>
      </div>
    </DashboardLayout>
  );
}
