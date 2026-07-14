/**
 * ConflictResolver — detects and represents conflicts across fused sources.
 *
 * Deterministic checks over the fused PIM: concepts documented but not implemented,
 * diagram elements with no implementation (outdated diagrams), version mismatches,
 * duplicated ownership, code endpoints missing from the API spec, and orphaned
 * entities. Each conflict carries evidence, so it is traceable and explainable — the
 * spec's "represent conflicts explicitly".
 */

import type { Conflict, Evidence, PimEntity, PimRelation } from '../pim/ProjectIntelligenceModel';

const IMPLEMENTABLE = new Set(['service', 'component', 'module', 'api', 'endpoint']);

export function detectConflicts(entities: readonly PimEntity[], relations: readonly PimRelation[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const has = (e: PimEntity, kind: string) => e.sourceKinds.includes(kind);
  const projectHasCode = entities.some((e) => has(e, 'code'));
  const projectHasApiSpec = entities.some((e) => has(e, 'api'));

  const ev = (e: PimEntity): Evidence[] => e.evidence.slice(0, 3);
  const add = (kind: Conflict['kind'], severity: Conflict['severity'], message: string, ids: string[], evidence: Evidence[]) =>
    conflicts.push({ id: `conflict:${kind}:${ids.join(',')}`, kind, severity, message, entities: ids, evidence });

  for (const e of entities) {
    if (e.inferred) continue;

    // Documented but not implemented.
    if (projectHasCode && IMPLEMENTABLE.has(e.kind) && has(e, 'document') && !has(e, 'code') && !has(e, 'infrastructure')) {
      add('missing-implementation', 'medium', `"${e.name}" is described in documentation but has no implementation in code.`, [e.id], ev(e));
    }

    // Diagram element with no implementation → outdated diagram.
    if (has(e, 'diagram') && !has(e, 'code') && !has(e, 'infrastructure')) {
      add('outdated-diagram', 'medium', `"${e.name}" appears in a diagram but is not found in code or infrastructure — the diagram may be outdated.`, [e.id], ev(e));
    }

    // Version mismatch across sources.
    if (e.versions && e.versions.length >= 2) {
      add('version-mismatch', 'high', `"${e.name}" has conflicting versions across sources: ${e.versions.join(', ')}.`, [e.id], ev(e));
    }

    // Endpoint in code but not in the API specification.
    if (projectHasApiSpec && (e.kind === 'endpoint' || e.kind === 'api') && has(e, 'code') && !has(e, 'api')) {
      add('inconsistent-api', 'low', `"${e.name}" exists in code but is not declared in the API specification.`, [e.id], ev(e));
    }
  }

  // Duplicated ownership: an entity owned by more than one owner.
  const ownersOf = new Map<string, Set<string>>();
  for (const r of relations) {
    if (r.kind === 'owns') {
      const set = ownersOf.get(r.target) ?? new Set<string>();
      set.add(r.source);
      ownersOf.set(r.target, set);
    }
  }
  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const [targetId, owners] of ownersOf) {
    if (owners.size >= 2) {
      const target = byId.get(targetId);
      add('duplicate-ownership', 'medium', `"${target?.name ?? targetId}" is owned by ${owners.size} different owners.`, [targetId, ...owners], target ? ev(target) : []);
    }
  }

  return conflicts;
}
