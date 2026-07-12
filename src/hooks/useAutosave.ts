import { useCallback, useEffect, useRef } from 'react';
import { useDiagramRuntime } from '@/features/canvas';
import { ApiError, diagramApi } from '@/services';
import { useAutosaveStore, useSettingsStore } from '@/store';
import { useSaveDiagram } from './useDiagram';

const DEBOUNCE_MS = 1200;
const MAX_RETRY_DELAY_MS = 30_000;

interface UseAutosaveOptions {
  projectId: string;
  /** The diagram version returned when the document was loaded. */
  initialVersion: number;
}

/**
 * Autosave loop, driven by the **DSL runtime** (Module 3): runtime commit →
 * debounce → dirty check → persist the DSL document → success, with retry/backoff
 * and offline handling.
 *
 * The persisted payload is now the `DiagramDocument` itself (the source of
 * truth), not the Excalidraw scene. Timing is driven by refs so the frequent
 * commit stream never re-renders the host; an in-flight guard plus a version
 * dirty check prevent duplicate/no-op requests.
 */
export function useAutosave({ projectId, initialVersion }: UseAutosaveOptions): void {
  const runtime = useDiagramRuntime();
  const saveMutation = useSaveDiagram();
  const setStatus = useAutosaveStore((s) => s.set);
  const autosaveEnabled = useSettingsStore((s) => s.autosaveEnabled);

  const latestVersion = useRef(runtime.getVersion());
  const savedVersion = useRef<number | null>(null);
  const serverVersion = useRef(initialVersion);
  const inFlight = useRef(false);
  const retries = useRef(0);
  const debounceTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const runRef = useRef<() => void>(() => {});

  const scheduleDebounced = useCallback(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => runRef.current(), DEBOUNCE_MS);
  }, []);

  const scheduleRetry = useCallback(() => {
    retries.current += 1;
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** retries.current);
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => runRef.current(), delay);
  }, []);

  const performSave = useCallback(async () => {
    if (inFlight.current) return;

    const target = latestVersion.current;
    if (savedVersion.current === target) return; // dirty check — nothing new

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus({ status: 'offline' });
      scheduleRetry();
      return;
    }

    inFlight.current = true;
    setStatus({ status: 'saving' });

    let succeeded = false;
    try {
      // Persist the DSL document — the single source of truth.
      const data = runtime.getDocument();
      const result = await saveMutation.mutateAsync({
        projectId,
        data,
        baseVersion: serverVersion.current,
      });
      serverVersion.current = result.version;
      savedVersion.current = target;
      retries.current = 0;
      succeeded = true;
    } catch (error) {
      if (error instanceof ApiError && error.isConflict) {
        try {
          const latest = await diagramApi.get(projectId);
          serverVersion.current = latest.version;
        } catch {
          /* fall through to retry */
        }
      }
      setStatus({
        status: 'error',
        error: error instanceof Error ? error.message : 'Save failed',
      });
      scheduleRetry();
    } finally {
      inFlight.current = false;
    }

    if (succeeded) {
      setStatus({ status: 'saved', lastSavedAt: Date.now(), error: null });
      if (latestVersion.current !== savedVersion.current) scheduleDebounced();
    }
  }, [runtime, projectId, saveMutation, setStatus, scheduleRetry, scheduleDebounced]);

  useEffect(() => {
    runRef.current = () => void performSave();
  }, [performSave]);

  // Establish the "already saved" baseline from the runtime's initial version.
  useEffect(() => {
    if (savedVersion.current === null) {
      savedVersion.current = runtime.getVersion();
      latestVersion.current = runtime.getVersion();
      setStatus({ status: 'saved', lastSavedAt: null, error: null });
    }
  }, [runtime, setStatus]);

  // Every committed DSL change schedules a debounced save.
  useEffect(() => {
    const unsubscribe = runtime.subscribe((state) => {
      latestVersion.current = state.version;
      if (
        autosaveEnabled &&
        savedVersion.current !== null &&
        state.version !== savedVersion.current
      ) {
        scheduleDebounced();
      }
    });
    return unsubscribe;
  }, [runtime, autosaveEnabled, scheduleDebounced]);

  // Flush a pending save as soon as connectivity returns.
  useEffect(() => {
    const onOnline = () => runRef.current();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // Clear timers when leaving the editor.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      useAutosaveStore.getState().reset();
    };
  }, []);
}
