import type { DiagramResponse } from '@/types';
import { apiClient } from './apiClient';

/** Diagram load/save client. `data` is the opaque diagram document. */
export const diagramApi = {
  get(projectId: string): Promise<DiagramResponse> {
    return apiClient.get<DiagramResponse>(`/projects/${projectId}/diagram`);
  },

  save(
    projectId: string,
    data: unknown,
    baseVersion?: number,
  ): Promise<DiagramResponse> {
    return apiClient.put<DiagramResponse>(`/projects/${projectId}/diagram`, {
      data,
      baseVersion,
    });
  },
};
