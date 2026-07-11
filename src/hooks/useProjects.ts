import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { projectService } from '@/services';
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '@/types';

/** Centralized query keys so cache invalidation stays consistent. */
export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
};

/** Fetch all projects. Server state — owned by the query cache, not Zustand. */
export function useProjects(): UseQueryResult<Project[]> {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => projectService.list(),
  });
}

/** Fetch a single project by id. */
export function useProject(id: string | undefined): UseQueryResult<Project | null> {
  return useQuery({
    queryKey: id ? projectKeys.detail(id) : projectKeys.all,
    queryFn: () => projectService.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateProject(): UseMutationResult<
  Project,
  Error,
  CreateProjectInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectService.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject(): UseMutationResult<
  Project,
  Error,
  { id: string; input: UpdateProjectInput }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProjectInput }) =>
      projectService.update(id, input),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.setQueryData(projectKeys.detail(project.id), project);
    },
  });
}

export function useDuplicateProject(): UseMutationResult<Project, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectService.duplicate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteProject(): UseMutationResult<
  { id: string },
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
