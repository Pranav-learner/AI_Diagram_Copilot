import { RouterProvider } from 'react-router-dom';
import { AppProviders, router } from '@/app';

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export default App;
