/**
 * Diagram-type registry — the extensibility seam for supported diagram types.
 *
 * Each supported type carries the metadata the pipeline needs: a human label,
 * a description (fed to the prompt), a default layout + flow direction, and the
 * typical semantic node roles. Adding a new diagram type is one `register()`
 * call plus (optionally) a new layout algorithm — no changes to the planner,
 * generator, or validator. The LLM only ever names a type; the application owns
 * what that type *means* visually.
 */

import type { LayoutDirection, LayoutKind } from '../layout/types';

/** The built-in supported diagram types. Open for registry extension. */
export const DIAGRAM_TYPES = [
  'flowchart',
  'mindmap',
  'architecture',
  'sequence',
  'erd',
  'class',
  'state',
  'decision-tree',
  'org-chart',
  'network',
  'timeline',
] as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];

/** Semantic layout hint the LLM may suggest (not a renderer concept). */
export const LAYOUT_HINTS = [
  'hierarchical',
  'tree',
  'flow',
  'radial',
  'mindmap',
  'grid',
  'horizontal',
  'vertical',
  'layered',
] as const;

export type LayoutHint = (typeof LAYOUT_HINTS)[number];

export interface DiagramTypeDefinition {
  readonly type: DiagramType;
  readonly label: string;
  readonly description: string;
  readonly defaultLayout: LayoutKind;
  readonly direction: LayoutDirection;
  /** Typical semantic roles for nodes of this type — guides prompting + shapes. */
  readonly roles: readonly string[];
}

const BUILTIN_DEFINITIONS: readonly DiagramTypeDefinition[] = [
  { type: 'flowchart', label: 'Flowchart', description: 'Process/decision flow with start, steps, decisions, and end.', defaultLayout: 'layered', direction: 'TB', roles: ['start', 'process', 'decision', 'input', 'output', 'end'] },
  { type: 'mindmap', label: 'Mind Map', description: 'A central topic with branching subtopics.', defaultLayout: 'mindmap', direction: 'LR', roles: ['topic', 'subtopic'] },
  { type: 'architecture', label: 'Architecture Diagram', description: 'System components (services, databases, queues) and their connections.', defaultLayout: 'layered', direction: 'TB', roles: ['client', 'gateway', 'service', 'api', 'database', 'cache', 'queue', 'external'] },
  { type: 'sequence', label: 'Sequence Diagram', description: 'Participants exchanging ordered messages over time.', defaultLayout: 'linear', direction: 'LR', roles: ['participant', 'actor'] },
  { type: 'erd', label: 'ER Diagram', description: 'Entities and their relationships (cardinality).', defaultLayout: 'layered', direction: 'LR', roles: ['entity'] },
  { type: 'class', label: 'UML Class Diagram', description: 'Classes/interfaces and their associations and inheritance.', defaultLayout: 'layered', direction: 'TB', roles: ['class', 'interface', 'abstract'] },
  { type: 'state', label: 'State Machine', description: 'States and the transitions between them.', defaultLayout: 'layered', direction: 'LR', roles: ['initial', 'state', 'final'] },
  { type: 'decision-tree', label: 'Decision Tree', description: 'Decisions branching into outcomes.', defaultLayout: 'tree', direction: 'TB', roles: ['decision', 'outcome'] },
  { type: 'org-chart', label: 'Organization Chart', description: 'Reporting hierarchy of roles/people.', defaultLayout: 'tree', direction: 'TB', roles: ['role', 'person'] },
  { type: 'network', label: 'Network Diagram', description: 'Devices/hosts and the links between them.', defaultLayout: 'radial', direction: 'TB', roles: ['router', 'switch', 'server', 'host', 'firewall'] },
  { type: 'timeline', label: 'Timeline', description: 'Chronological sequence of events/milestones.', defaultLayout: 'linear', direction: 'LR', roles: ['event', 'milestone'] },
];

export class DiagramTypeRegistry {
  private readonly defs = new Map<DiagramType, DiagramTypeDefinition>();

  register(def: DiagramTypeDefinition): this {
    this.defs.set(def.type, def);
    return this;
  }

  has(type: string): type is DiagramType {
    return this.defs.has(type as DiagramType);
  }

  get(type: DiagramType): DiagramTypeDefinition | undefined {
    return this.defs.get(type);
  }

  list(): readonly DiagramTypeDefinition[] {
    return [...this.defs.values()];
  }

  types(): readonly DiagramType[] {
    return [...this.defs.keys()];
  }
}

export function createDefaultDiagramTypeRegistry(): DiagramTypeRegistry {
  const registry = new DiagramTypeRegistry();
  for (const def of BUILTIN_DEFINITIONS) registry.register(def);
  return registry;
}

export const defaultDiagramTypeRegistry = createDefaultDiagramTypeRegistry();

export interface ResolvedLayout {
  readonly kind: LayoutKind;
  readonly direction: LayoutDirection;
}

/** Map a semantic layout hint (+ the type's defaults) to a concrete layout. */
export function resolveLayout(hint: LayoutHint | undefined, def: DiagramTypeDefinition): ResolvedLayout {
  if (!hint) return { kind: def.defaultLayout, direction: def.direction };
  switch (hint) {
    case 'hierarchical':
    case 'layered':
      return { kind: 'layered', direction: def.direction };
    case 'tree':
      return { kind: 'tree', direction: 'TB' };
    case 'flow':
      return { kind: 'layered', direction: 'LR' };
    case 'horizontal':
      return { kind: 'linear', direction: 'LR' };
    case 'vertical':
      return { kind: 'layered', direction: 'TB' };
    case 'radial':
      return { kind: 'radial', direction: def.direction };
    case 'mindmap':
      return { kind: 'mindmap', direction: 'LR' };
    case 'grid':
      return { kind: 'grid', direction: def.direction };
    default:
      return { kind: def.defaultLayout, direction: def.direction };
  }
}
