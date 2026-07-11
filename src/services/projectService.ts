import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '@/types';
import { ApiError, apiClient } from './apiClient';

/**
 * Project API client.
 *
 * Acts as an anti-corruption layer: the backend speaks `name`, this app speaks
 * `title`. The mapping lives here so components and hooks stay unchanged from
 * the mock-data era — only this file learned to talk to FastAPI.
 */

/** Wire shape returned by the backend. */
interface ProjectDto {
  id: string;
  name: string;
  description: string;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

function toProject(dto: ProjectDto): Project {
  return {
    id: dto.id,
    title: dto.name,
    description: dto.description,
    thumbnailUrl: dto.thumbnailUrl,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export const projectService = {
  async list(): Promise<Project[]> {
    const dtos = await apiClient.get<ProjectDto[]>('/projects');
    return dtos.map(toProject);
  },

  async get(id: string): Promise<Project | null> {
    try {
      const dto = await apiClient.get<ProjectDto>(`/projects/${id}`);
      return toProject(dto);
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) return null;
      throw error;
    }
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const dto = await apiClient.post<ProjectDto>('/projects', {
      name: input.title,
      description: input.description ?? '',
    });
    return toProject(dto);
  },

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const body: { name?: string; description?: string } = {};
    if (input.title !== undefined) body.name = input.title;
    if (input.description !== undefined) body.description = input.description;
    const dto = await apiClient.patch<ProjectDto>(`/projects/${id}`, body);
    return toProject(dto);
  },

  async duplicate(id: string): Promise<Project> {
    const dto = await apiClient.post<ProjectDto>(`/projects/${id}/duplicate`);
    return toProject(dto);
  },

  async remove(id: string): Promise<{ id: string }> {
    await apiClient.delete<void>(`/projects/${id}`);
    return { id };
  },
};
