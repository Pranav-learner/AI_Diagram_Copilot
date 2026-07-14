/**
 * Public API of the AI feature — the copilot experience layer.
 *
 * The editor renders {@link AiSidebar} inside {@link AIGenerationProvider} (which
 * must sit within the DiagramRuntimeProvider). The sidebar is a self-contained
 * copilot: conversation, streaming stages, execution timeline, operation
 * summaries, previews, history, prompt library, and settings. It consumes the
 * generator/editor/runtime/metrics via {@link useAiCopilot}; it owns no business
 * logic. See `src/features/ai/COPILOT.md`.
 */

export { AIGenerationProvider } from './AIGenerationProvider';
export { AiSidebar } from './components/AiSidebar';
export { useAiCopilot } from './useAiCopilot';
export type { UseAiCopilot } from './useAiCopilot';
export type { AiTurn, TurnKind, TurnStatus, TimelineStage } from './types';
export { createEditorAIService } from './aiService';
export type { EditorAIBundle } from './aiService';
export { useAiSettingsStore } from './store/useAiSettingsStore';
export { usePromptLibraryStore } from './store/usePromptLibraryStore';
export { useAiConversationStore } from './store/useAiConversationStore';
export { summarizePatch } from './lib/operationSummary';
export type { OperationSummary } from './lib/operationSummary';
export { humanizeError } from './lib/humanizeError';
export type { HumanError } from './lib/humanizeError';

export { SoftwareIntelligenceWorkspace } from './components/SoftwareIntelligenceWorkspace';
export { useProjectIntelligenceStore } from './store/useProjectIntelligenceStore';

