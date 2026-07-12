/**
 * Public API of the AI feature (diagram generation UI).
 *
 * The editor renders {@link GenerationPanel} inside {@link AIGenerationProvider}
 * (which must sit within the DiagramRuntimeProvider). Everything talks to the
 * `@/ai` foundation through the {@link DiagramGenerator} and the runtime gateway.
 */

export { AIGenerationProvider } from './AIGenerationProvider';
export { GenerationPanel } from './components/GenerationPanel';
export { useDiagramGeneration } from './useDiagramGeneration';
export type { UseDiagramGeneration, GenerationStatus, StageView } from './useDiagramGeneration';
export { createEditorAIService } from './aiService';
export type { EditorAIBundle } from './aiService';
