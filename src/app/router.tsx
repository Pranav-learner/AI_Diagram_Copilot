import { createBrowserRouter } from 'react-router-dom';
import { DashboardPage, EditorPage, NotFoundPage } from '@/pages';

/** Application routes. Editor is keyed by project id; anything else 404s. */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardPage />,
  },
  {
    path: '/editor/:projectId',
    element: <EditorPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
