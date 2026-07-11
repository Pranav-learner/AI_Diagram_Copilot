/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the backend API. Defaults to `/api` (proxied) when unset. */
  readonly VITE_API_URL?: string;
}
