import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks';

/**
 * Slim global banner shown while the browser is offline. Reassures the user
 * that autosave will resume on reconnect.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-medium text-amber-950"
    >
      <WifiOff className="size-3.5" aria-hidden />
      You're offline — changes will sync automatically when you reconnect.
    </div>
  );
}
