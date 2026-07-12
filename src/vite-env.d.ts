/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the backend API. Defaults to `/api` (proxied) when unset. */
  readonly VITE_API_URL?: string;
  /** Anthropic API key. When set, AI generation uses Claude (else a demo mock). */
  readonly VITE_ANTHROPIC_API_KEY?: string;
  /** OpenAI API key. Used when no Anthropic key is present. */
  readonly VITE_OPENAI_API_KEY?: string;
}
