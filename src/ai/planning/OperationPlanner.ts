/**
 * OperationPlanner — bridges model reasoning to executable runtime operations.
 *
 * The spec is emphatic: the LLM does NOT emit runtime operations. It emits a
 * validated *high-level plan* ({@link PlanStep}s); the planner compiles those
 * into {@link OperationDescriptor}s (the runtime registry's `{type, params}`
 * contract) and executes them through the {@link DiagramGateway} **port** — the
 * AI layer's single, interface-only touchpoint with the diagram engine.
 *
 * Compilation is table-driven: a feature registers a {@link PlanCompiler} for
 * its step kind and gains execution with no change here. Descriptors are
 * pre-validated against the gateway's known operation types (fail fast on an
 * unknown op) before anything reaches the runtime, which then applies its own
 * per-operation `validate`. Nothing bypasses this path.
 */

import type { AIIssue } from '../core/types';
import { aiIssue } from '../core/types';
import { PlanningError } from '../core/AIError';
import type { OperationDescriptor, OperationPlan } from '../validation/schemas/operationPlan';

// ── The port to the runtime (interface only — no engine import) ─────────────

export interface OperationApplyResult {
  /** Number of operations applied. */
  readonly applied: number;
  /** The runtime document version after applying. */
  readonly version: number;
}

/**
 * The write-side port to the diagram. The app implements this over
 * `DiagramRuntime`: `knownOperationTypes` from the operation registry, `apply`
 * via `transaction`/`executeType`. The AI layer depends only on this interface.
 */
export interface DiagramGateway {
  /** The operation types the runtime can execute (for pre-validation). */
  knownOperationTypes(): readonly string[];
  /** Apply a plan. Atomic plans commit as one undoable transaction. */
  apply(plan: OperationPlan): OperationApplyResult;
}

// ── High-level plans & compilers ────────────────────────────────────────────

/** A single high-level intent step. `kind` selects the compiler; `data` is its input. */
export interface PlanStep<K extends string = string, D = unknown> {
  readonly kind: K;
  readonly data: D;
}

/** Mints concrete entity ids so a plan can reference not-yet-created entities. */
export interface IdMinter {
  node(): string;
  edge(): string;
  group(): string;
}

export interface PlanCompileContext {
  readonly ids: IdMinter;
  /**
   * Resolve a stable concrete node id for a local reference key. The first call
   * for a key mints an id; later calls return the same id — so a compiler can
   * "create node ref('A')" then "connect ref('A') → ref('B')" coherently.
   */
  ref(localKey: string): string;
}

export type PlanCompiler<S extends PlanStep = PlanStep> = (
  step: S,
  ctx: PlanCompileContext,
) => readonly OperationDescriptor[];

export class PlanCompilerRegistry {
  private readonly compilers = new Map<string, PlanCompiler>();

  register<S extends PlanStep>(kind: S['kind'], compiler: PlanCompiler<S>): this {
    this.compilers.set(kind, compiler as PlanCompiler);
    return this;
  }

  has(kind: string): boolean {
    return this.compilers.has(kind);
  }

  get(kind: string): PlanCompiler | undefined {
    return this.compilers.get(kind);
  }
}

export interface OperationPlannerDeps {
  readonly compilers?: PlanCompilerRegistry;
  /** Id minter; default is a deterministic counter (inject a DSL IdFactory-backed one in prod). */
  readonly ids?: IdMinter;
}

export interface PlanBuildResult {
  readonly plan: OperationPlan;
  /** Non-fatal notes (e.g. skipped no-op steps). */
  readonly issues: readonly AIIssue[];
}

export class OperationPlanner {
  private readonly compilers: PlanCompilerRegistry;
  private readonly ids: IdMinter;

  constructor(deps: OperationPlannerDeps = {}) {
    this.compilers = deps.compilers ?? new PlanCompilerRegistry();
    this.ids = deps.ids ?? counterIdMinter();
  }

  get registry(): PlanCompilerRegistry {
    return this.compilers;
  }

  /**
   * Compile high-level steps into an {@link OperationPlan}. Throws
   * {@link PlanningError} if a step kind has no registered compiler.
   */
  compile(steps: readonly PlanStep[], opts: { atomic?: boolean; label?: string } = {}): PlanBuildResult {
    const ctx = this.context();
    const operations: OperationDescriptor[] = [];
    const issues: AIIssue[] = [];

    for (const [i, step] of steps.entries()) {
      const compiler = this.compilers.get(step.kind);
      if (!compiler) {
        throw new PlanningError(`No compiler registered for plan step "${step.kind}"`, [
          aiIssue('unknown_step', `unknown step kind "${step.kind}"`, `steps.${i}`),
        ]);
      }
      const descriptors = compiler(step, ctx);
      if (descriptors.length === 0) {
        issues.push(aiIssue('empty_step', `step "${step.kind}" produced no operations`, `steps.${i}`));
      }
      operations.push(...descriptors);
    }

    return { plan: { operations, atomic: opts.atomic ?? true, label: opts.label }, issues };
  }

  /**
   * Validate a plan's descriptors against the runtime's known operation types.
   * Returns issues; does not throw. Use before {@link execute} for a friendly
   * failure surface.
   */
  validate(plan: OperationPlan, knownTypes: readonly string[]): readonly AIIssue[] {
    const known = new Set(knownTypes);
    const issues: AIIssue[] = [];
    plan.operations.forEach((op, i) => {
      if (!known.has(op.type)) {
        issues.push(aiIssue('unknown_operation', `operation type "${op.type}" is not registered`, `operations.${i}`));
      }
    });
    return issues;
  }

  /** Validate against the gateway, then apply. Throws {@link PlanningError} if invalid. */
  execute(plan: OperationPlan, gateway: DiagramGateway): OperationApplyResult {
    const issues = this.validate(plan, gateway.knownOperationTypes());
    if (issues.length > 0) {
      throw new PlanningError(`plan contains ${issues.length} invalid operation(s)`, issues);
    }
    return gateway.apply(plan);
  }

  private context(): PlanCompileContext {
    const refs = new Map<string, string>();
    return {
      ids: this.ids,
      ref: (localKey) => {
        const existing = refs.get(localKey);
        if (existing) return existing;
        const id = this.ids.node();
        refs.set(localKey, id);
        return id;
      },
    };
  }
}

/** A deterministic counter-based id minter — sufficient for tests and defaults. */
export function counterIdMinter(prefix = 'ai'): IdMinter {
  let n = 0;
  const next = (kind: string) => `${prefix}_${kind}_${++n}`;
  return {
    node: () => next('node'),
    edge: () => next('edge'),
    group: () => next('group'),
  };
}
