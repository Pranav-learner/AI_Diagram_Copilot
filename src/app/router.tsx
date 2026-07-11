import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { PageLoader } from '@/components/common';

// Route-level code splitting. The editor chunk (which bundles Excalidraw) only
// loads when the user opens a diagram, keeping the dashboard load lean.
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const EditorPage = lazy(() =>
  import('@/pages/EditorPage').then((m) => ({ default: m.EditorPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

/** Wrap a lazily-loaded route element in a Suspense fallback. */
function withSuspense(element: ReactNode): ReactNode {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

/** Application routes. Editor is keyed by project id; anything else 404s. */
export const router = createBrowserRouter([
  {
    path: '/',
    element: withSuspense(<DashboardPage />),
  },
  {
    path: '/editor/:projectId',
    element: withSuspense(<EditorPage />),
  },
  {
    path: '/settings',
    element: withSuspense(<SettingsPage />),
  },
  {
    path: '*',
    element: withSuspense(<NotFoundPage />),
  },
]);
