import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks';
import type { Theme } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const ICON: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const NEXT_LABEL: Record<Theme, string> = {
  light: 'Switch to dark theme',
  dark: 'Switch to system theme',
  system: 'Switch to light theme',
};

/** Icon button that cycles light → dark → system. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const Icon = ICON[theme];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={NEXT_LABEL[theme]}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{NEXT_LABEL[theme]}</TooltipContent>
    </Tooltip>
  );
}
