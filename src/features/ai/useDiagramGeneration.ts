import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  GENERATION_STAGES,
  CancelledError,
  AIConfigError,
  TimeoutError,
  ResponseValidationError,
  GenerationError,
  ProviderError,
  NetworkError,
} from '@/ai';
import type { DiagramType, GenerationResult, StageState, StageUpdate } from '@/ai';
import { AIGenerationContext } from './AIGenerationContext';

export type GenerationStatus = 'idle' | 'generating' | 'success' | 'error';

export interface StageView {
  readonly stage: string;
  readonly label: string;
  readonly state: StageState;
  readonly detail?: string;
}

export interface GenerateOptions {
  readonly diagramType?: DiagramType;
}

export interface UseDiagramGeneration {
  readonly status: GenerationStatus;
  readonly isGenerating: boolean;
  readonly stages: readonly StageView[];
  readonly error: string | null;
  readonly result: GenerationResult | null;
  readonly usingMock: boolean;
  generate(prompt: string, options?: GenerateOptions): void;
  regenerate(): void;
  retry(): void;
  cancel(): void;
  reset(): void;
}

function initialStages(): StageView[] {
  return GENERATION_STAGES.map((s) => ({ stage: s.stage, label: s.label, state: 'pending' as StageState }));
}

export function useDiagramGeneration(): UseDiagramGeneration {
  const ctx = useContext(AIGenerationContext);
  if (!ctx) throw new Error('useDiagramGeneration must be used within an <AIGenerationProvider>.');
  const { generator, runtime, usingMock } = ctx;

  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [stages, setStages] = useState<StageView[]>(initialStages);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<{ prompt: string; diagramType?: DiagramType } | null>(null);

  const run = useCallback(
    async (req: { prompt: string; diagramType?: DiagramType }, opts: { regenerate: boolean }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      lastRequestRef.current = req;

      setStatus('generating');
      setError(null);
      setResult(null);
      setStages(initialStages());

      const observer = {
        onStage: (u: StageUpdate) =>
          setStages((prev) => prev.map((s) => (s.stage === u.stage ? { ...s, state: u.state, detail: u.detail } : s))),
      };

      try {
        const res = await generator.generate(
          { prompt: req.prompt, diagramType: req.diagramType, regenerate: opts.regenerate, signal: controller.signal, stream: true },
          observer,
        );
        setResult(res);
        setStatus('success');
      } catch (err) {
        if (err instanceof CancelledError) {
          setStatus('idle');
          setStages(initialStages());
        } else {
          setError(humanizeError(err));
          setStatus('error');
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [generator],
  );

  const generate = useCallback(
    (prompt: string, options?: GenerateOptions) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      void run({ prompt: trimmed, diagramType: options?.diagramType }, { regenerate: false });
    },
    [run],
  );

  const regenerate = useCallback(() => {
    const last = lastRequestRef.current;
    if (!last) return;
    // A successful generation is one atomic transaction — undo it for a clean
    // replace before producing a fresh variation.
    if (status === 'success' && runtime.canUndo) runtime.undo();
    void run(last, { regenerate: true });
  }, [run, runtime, status]);

  const retry = useCallback(() => {
    const last = lastRequestRef.current;
    if (last) void run(last, { regenerate: false });
  }, [run]);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setStatus('idle');
    setError(null);
    setResult(null);
    setStages(initialStages());
  }, []);

  return useMemo(
    () => ({
      status,
      isGenerating: status === 'generating',
      stages,
      error,
      result,
      usingMock,
      generate,
      regenerate,
      retry,
      cancel,
      reset,
    }),
    [status, stages, error, result, usingMock, generate, regenerate, retry, cancel, reset],
  );
}

/** Turn an AIError into a clear, user-facing message. */
function humanizeError(err: unknown): string {
  if (err instanceof AIConfigError) return 'No AI provider is configured. Add an API key to enable generation.';
  if (err instanceof TimeoutError) return 'The AI request timed out. Please try again.';
  if (err instanceof ResponseValidationError || err instanceof GenerationError) {
    return 'The AI could not produce a valid diagram for that request. Try rephrasing or being more specific.';
  }
  if (err instanceof ProviderError || err instanceof NetworkError) {
    return 'Could not reach the AI provider. Check your connection and try again.';
  }
  return err instanceof Error ? err.message : 'Something went wrong during generation.';
}
