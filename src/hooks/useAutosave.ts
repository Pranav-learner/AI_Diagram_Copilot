import { useCallback, useEffect, useRef } from 'react';
import {
  serializeScene,
  useCanvas,
  useCanvasReady,
  useSceneVersion,
} from '@/features/canvas';
import { ApiError, diagramApi } from '@/services';
import { useAutosaveStore, useSettingsStore } from '@/store';
import { useSaveDiagram } from './useDiagram';

const DEBOUNCE_MS = 1200;
const MAX_RETRY_DELAY_MS = 30_000;

interface UseAutosaveOptions {
  projectId: string;
  /** The diagram version returned when the scene was loaded. */
  initialVersion: number;
}

/**
 * Autosave loop: canvas change → debounce → dirty check → save → success, with
 * retry/backoff and offline handling.
 *
 * Timing is driven by refs (not React state) so the frequent scene-version
 * updates never re-render this hook's host, and an in-flight guard plus a
 * dirty check prevent duplicate/no-op requests ("no save spam").
 */
export function useAutosave({
  projectId,
  initialVersion,
}: UseAutosaveOptions): void {
  const engine = useCanvas();
  const isReady = useCanvasReady();
  const sceneVersion = useSceneVersion();
  const saveMutation = useSaveDiagram();
  const setStatus = useAutosaveStore((s) => s.set);
  const autosaveEnabled = useSettingsStore((s) => s.autosaveEnabled);

  const latestVersion = useRef(sceneVersion);
  const savedVersion = useRef<number | null>(null);
  const serverVersion = useRef(initialVersion);
  const inFlight = useRef(false);
  const retries = useRef(0);
  const debounceTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const runRef = useRef<() => void>(() => {});

  useEffect(() => {
    latestVersion.current = sceneVersion;
  }, [sceneVersion]);

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
      const data = serializeScene(engine.getScene());
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
      // On a version conflict, rebase on the server's current version and retry.
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
      // Edits arrived while saving (save outlasted the debounce) — save again.
      if (latestVersion.current !== savedVersion.current) scheduleDebounced();
    }
  }, [engine, projectId, saveMutation, setStatus, scheduleRetry, scheduleDebounced]);

  useEffect(() => {
    runRef.current = () => void performSave();
  }, [performSave]);

  // Establish the "already saved" baseline once the canvas is hydrated.
  useEffect(() => {
    if (isReady && savedVersion.current === null) {
      savedVersion.current = sceneVersion;
      setStatus({ status: 'saved', lastSavedAt: null, error: null });
    }
  }, [isReady, sceneVersion, setStatus]);

  // Debounce a save whenever the scene diverges from what's saved.
  useEffect(() => {
    if (!autosaveEnabled) return;
    if (!isReady || savedVersion.current === null) return;
    if (sceneVersion === savedVersion.current) return;
    scheduleDebounced();
  }, [sceneVersion, isReady, autosaveEnabled, scheduleDebounced]);

  // Flush a pending save as soon as connectivity returns.
  useEffect(() => {
    const onOnline = () => runRef.current();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // Reset status and clear timers when leaving the editor.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      useAutosaveStore.getState().reset();
    };
  }, []);
}
