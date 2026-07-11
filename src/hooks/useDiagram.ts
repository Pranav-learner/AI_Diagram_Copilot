import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { diagramApi } from '@/services';
import type { DiagramResponse } from '@/types';

/** Query keys for a project's diagram. */
export const diagramKeys = {
  detail: (projectId: string) => ['diagram', projectId] as const,
};

/**
 * Load a project's diagram. `staleTime: Infinity` so a window refocus never
 * refetches and clobbers in-progress local edits — the autosave loop is the
 * single writer that keeps the cache current.
 */
export function useDiagram(
  projectId: string | undefined,
): UseQueryResult<DiagramResponse> {
  return useQuery({
    queryKey: diagramKeys.detail(projectId ?? ''),
    queryFn: () => diagramApi.get(projectId as string),
    enabled: Boolean(projectId),
    staleTime: Infinity,
    retry: 1,
  });
}

export interface SaveDiagramArgs {
  projectId: string;
  data: unknown;
  baseVersion?: number;
}

/** Persist a diagram; refreshes the cached copy with the server's new version. */
export function useSaveDiagram(): UseMutationResult<
  DiagramResponse,
  Error,
  SaveDiagramArgs
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data, baseVersion }: SaveDiagramArgs) =>
      diagramApi.save(projectId, data, baseVersion),
    // Autosave owns retry/backoff; the mutation itself must not retry.
    retry: false,
    onSuccess: (result) => {
      queryClient.setQueryData(diagramKeys.detail(result.projectId), result);
    },
  });
}
