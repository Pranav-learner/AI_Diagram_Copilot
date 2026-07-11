import { RouterProvider } from 'react-router-dom';
import { AppProviders, router } from '@/app';
import { RootErrorBoundary } from '@/app/RootErrorBoundary';
import { OfflineBanner } from '@/components/common';

export function App() {
  return (
    <RootErrorBoundary>
      <AppProviders>
        <OfflineBanner />
        <RouterProvider router={router} />
      </AppProviders>
    </RootErrorBoundary>
  );
}

export default App;
