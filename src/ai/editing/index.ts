/**
 * Conversational Diagram Editing — public barrel (re-exported from `@/ai`).
 *
 * The AI produces a semantic {@link EditPlan}; the application understands the
 * diagram, resolves references (asking when ambiguous), previews the change, and
 * only then compiles it to operations for the runtime. The LLM never edits the
 * DSL or emits operations.
 */

export * from './model/EditPlan';
export * from './DiagramUnderstanding';
export * from './ReferenceResolver';
export * from './clarification';
export * from './preview';
export * from './editStyling';
export * from './validateEditPlan';
export * from './EditExecutionPlanner';
export * from './prompts/editPrompts';
export * from './MockEditProvider';
export * from './errors';
export * from './DiagramEditor';
export * from './EditHandler';
