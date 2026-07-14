/**
 * Query API — rich, graph-traversal queries over the PIM.
 *
 * The single interface future AI features (Repository Copilot, Architecture AI,
 * Documentation AI) use to answer "who owns this?", "what depends on this?", "what's
 * the downstream impact?", "where is this implemented / deployed / documented?", and
 * "which requirements relate to this?". Deterministic graph traversal over a PIM
 * snapshot.
 */

import type { Evidence, PimEntity, PimRelation, ProjectIntelligenceModel } from './pim/ProjectIntelligenceModel';
import { defaultOntology } from '../knowledge/ontology/ProjectOntology';

export type PimDirection = 'out' | 'in' | 'both';

const DEP_KINDS = new Set(['dependsOn', 'calls', 'references', 'uses']);

export class PimQuery {
  constructor(private readonly pim: ProjectIntelligenceModel) {}

  private resolve(idOrName: string): PimEntity | undefined {
    return this.pim.getEntity(idOrName) ?? this.pim.findByName(idOrName);
  }

  /** Entities that `owns` the given entity. */
  findOwners(idOrName: string): PimEntity[] {
    const e = this.resolve(idOrName);
    if (!e) return [];
    return this.pim.incoming(e.id).filter((r) => r.kind === 'owns').map((r) => this.pim.getEntity(r.source)!).filter(Boolean);
  }

  /** What the entity depends on (outgoing dependency edges). */
  findDependencies(idOrName: string): PimEntity[] {
    return this.neighborsVia(idOrName, DEP_KINDS, 'out');
  }
  /** What depends on the entity (incoming dependency edges). */
  findDependents(idOrName: string): PimEntity[] {
    return this.neighborsVia(idOrName, DEP_KINDS, 'in');
  }

  /** Transitive dependents — the blast radius of changing this entity. */
  downstreamImpact(idOrName: string): PimEntity[] {
    const start = this.resolve(idOrName);
    if (!start) return [];
    const seen = new Set<string>([start.id]);
    const queue = [start.id];
    const out: PimEntity[] = [];
    let head = 0;
    while (head < queue.length) {
      const id = queue[head++]!;
      for (const r of this.pim.incoming(id)) {
        if (!DEP_KINDS.has(r.kind) || seen.has(r.source)) continue;
        seen.add(r.source);
        const src = this.pim.getEntity(r.source);
        if (src) {
          out.push(src);
          queue.push(r.source);
        }
      }
    }
    return out;
  }

  /** Documentation evidence for the entity (find related documentation). */
  relatedDocumentation(idOrName: string): Evidence[] {
    return this.evidenceOf(idOrName, 'document');
  }
  /** Code evidence for the entity (find implementation). */
  findImplementation(idOrName: string): Evidence[] {
    return this.evidenceOf(idOrName, 'code');
  }
  /** Infrastructure evidence for the entity (find deployment). */
  findDeployment(idOrName: string): Evidence[] {
    return this.evidenceOf(idOrName, 'infrastructure');
  }

  /** Requirements related to (or implemented by) the entity. */
  findRequirements(idOrName: string): PimEntity[] {
    return this.findRelatedByOntologyType(idOrName, 'Requirement');
  }

  /** Find entities related to this one by their ontology type (supporting inheritance) */
  findRelatedByOntologyType(idOrName: string, ontologyType: string): PimEntity[] {
    const e = this.resolve(idOrName);
    if (!e) return [];
    const out = new Map<string, PimEntity>();
    for (const r of [...this.pim.incoming(e.id), ...this.pim.outgoing(e.id)]) {
      const otherId = r.source === e.id ? r.target : r.source;
      const other = this.pim.getEntity(otherId);
      if (other && (other.ontologyType === ontologyType || defaultOntology.isSubconceptOf(other.ontologyType, ontologyType))) {
        out.set(otherId, other);
      }
    }
    return [...out.values()];
  }

  /** Generic traversal: entities reachable within `maxDepth` over `relationKinds`. */
  traverse(idOrName: string, opts: { relationKinds?: ReadonlySet<string>; direction?: PimDirection; maxDepth?: number } = {}): PimEntity[] {
    const start = this.resolve(idOrName);
    if (!start) return [];
    const direction = opts.direction ?? 'out';
    const maxDepth = opts.maxDepth ?? Infinity;
    const seen = new Set<string>([start.id]);
    const queue: Array<{ id: string; depth: number }> = [{ id: start.id, depth: 0 }];
    const out: PimEntity[] = [];
    let head = 0;
    while (head < queue.length) {
      const { id, depth } = queue[head++]!;
      if (depth >= maxDepth) continue;
      const rels = this.edges(id, direction);
      for (const r of rels) {
        if (opts.relationKinds && !opts.relationKinds.has(r.kind)) continue;
        const otherId = r.source === id ? r.target : r.source;
        if (seen.has(otherId)) continue;
        seen.add(otherId);
        const other = this.pim.getEntity(otherId);
        if (other) {
          out.push(other);
          queue.push({ id: otherId, depth: depth + 1 });
        }
      }
    }
    return out;
  }

  // ── internals ─────────────────────────────────────────────────────────────────
  private neighborsVia(idOrName: string, kinds: ReadonlySet<string>, direction: PimDirection): PimEntity[] {
    const e = this.resolve(idOrName);
    if (!e) return [];
    const out = new Map<string, PimEntity>();
    for (const r of this.edges(e.id, direction)) {
      if (!kinds.has(r.kind)) continue;
      const otherId = direction === 'in' ? r.source : direction === 'out' ? r.target : r.source === e.id ? r.target : r.source;
      const other = this.pim.getEntity(otherId);
      if (other) out.set(otherId, other);
    }
    return [...out.values()];
  }

  private edges(id: string, direction: PimDirection): PimRelation[] {
    if (direction === 'out') return this.pim.outgoing(id);
    if (direction === 'in') return this.pim.incoming(id);
    return [...this.pim.outgoing(id), ...this.pim.incoming(id)];
  }

  private evidenceOf(idOrName: string, origin: string): Evidence[] {
    const e = this.resolve(idOrName);
    return e ? e.evidence.filter((ev) => ev.origin === origin) : [];
  }
}
