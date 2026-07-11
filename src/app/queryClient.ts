import { QueryClient } from '@tanstack/react-query';

/** Shared TanStack Query client with sensible defaults for a mocked backend. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
