import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

// NOTE: React.StrictMode is intentionally omitted. Its dev-only double-mount is
// incompatible with Excalidraw (the committed canvas instance becomes
// non-interactive after the simulated unmount/remount), which would break the
// editor in `npm run dev`. StrictMode's double-invoke never runs in production
// builds, so this only affects local development — a well-known trade-off for
// apps embedding canvas libraries.
createRoot(rootElement).render(<App />);
