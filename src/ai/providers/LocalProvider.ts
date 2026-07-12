/**
 * Local / self-hosted provider.
 *
 * Most local runtimes (Ollama, LM Studio, vLLM, llama.cpp server) expose an
 * OpenAI-compatible `/chat/completions` endpoint, so the LocalProvider is a thin
 * specialization of {@link OpenAIProvider}: a distinct id, a localhost default
 * base URL, and no mandatory api key. This is the payoff of a clean provider
 * abstraction — a whole class of backends is supported by configuration alone.
 */

import { OpenAIProvider } from './OpenAIProvider';
import type { OpenAICompatibleOptions } from './OpenAIProvider';

const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';

export class LocalProvider extends OpenAIProvider {
  constructor(config: OpenAICompatibleOptions = {}) {
    super({
      ...config,
      id: config.id ?? 'local',
      baseURL: config.baseURL ?? DEFAULT_LOCAL_BASE_URL,
      requireApiKey: config.requireApiKey ?? false,
      maxContextTokens: config.maxContextTokens ?? 32_000,
    });
  }
}

/** Convenience factory. */
export function localProvider(config?: OpenAICompatibleOptions): LocalProvider {
  return new LocalProvider(config);
}
