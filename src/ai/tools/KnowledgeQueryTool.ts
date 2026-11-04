import { z } from 'zod';
import type { Tool } from './Tool';
import type { ExecutionContext } from '../execution/ExecutionContext';
import type { ProjectIntelligenceModel, PimEntity } from '../project-intelligence/pim/ProjectIntelligenceModel';
import type { ProjectIntelligenceEngine } from '../project-intelligence/ProjectIntelligenceEngine';

export const KnowledgeQueryInputSchema = z.object({
  query: z.string().optional(),
  entityId: z.string().optional(),
  action: z.enum(['lookup', 'search', 'relationships', 'dependencies', 'impact', 'all']).default('search'),
  minConfidence: z.number().min(0).max(1).default(0.0),
  limit: z.number().min(1).max(100).default(20),
});

export type KnowledgeQueryInput = z.infer<typeof KnowledgeQueryInputSchema>;

export class KnowledgeQueryTool implements Tool {
  readonly id = 'knowledge:query';
  readonly name = 'Knowledge Query Tool';
  readonly description = 'Queries the Project Intelligence Model (PIM) for entities, dependencies, and blast-radius impact.';
  readonly permissionsRequired = ['read:pim'];
  readonly inputSchema = KnowledgeQueryInputSchema;

  async execute(args: KnowledgeQueryInput, context: ExecutionContext): Promise<any> {
    const pim: ProjectIntelligenceModel | undefined =
      context.metadata.pim || (context.metadata.engine as ProjectIntelligenceEngine | undefined)?.getPIM();

    if (!pim) {
      return {
        success: false,
        error: 'No Project Intelligence Model (PIM) available in execution context',
        entities: [],
        relations: [],
      };
    }

    const { query = '', entityId, action, minConfidence, limit } = args;

    // 1. Single Entity Lookup
    if (entityId) {
      const entity = typeof pim.entity === 'function'
        ? pim.entity(entityId)
        : Array.isArray((pim as any).entities)
        ? (pim as any).entities.find((e: any) => e.id === entityId)
        : undefined;

      if (!entity) {
        return { success: false, error: `Entity "${entityId}" not found`, entities: [] };
      }

      if (action === 'impact') {
        const engine: ProjectIntelligenceEngine | undefined = context.metadata.engine;
        const impact = engine ? engine.query().downstreamImpact(entityId) : [];
        return {
          success: true,
          targetEntity: entity,
          downstreamImpact: impact.map((e) => ({
            id: e.id,
            name: e.name,
            kind: e.kind,
            ontologyType: e.ontologyType,
          })),
        };
      }

      if (action === 'dependencies') {
        const outgoing = typeof pim.outgoing === 'function'
          ? pim.outgoing(entityId)
          : Array.isArray((pim as any).relations)
          ? (pim as any).relations.filter((r: any) => r.source === entityId)
          : [];
        const incoming = typeof pim.incoming === 'function'
          ? pim.incoming(entityId)
          : Array.isArray((pim as any).relations)
          ? (pim as any).relations.filter((r: any) => r.target === entityId)
          : [];
        return {
          success: true,
          entity,
          dependencies: outgoing.map((r: any) => ({ target: r.target, kind: r.kind, confidence: r.confidence ?? 1.0 })),
          dependents: incoming.map((r: any) => ({ source: r.source, kind: r.kind, confidence: r.confidence ?? 1.0 })),
        };
      }

      return { success: true, entity };
    }

    // 2. Search Entities
    const lowerQuery = query.toLowerCase().trim();
    const rawEntities: readonly any[] = typeof pim.entities === 'function'
      ? pim.entities()
      : Array.isArray((pim as any).entities)
      ? (pim as any).entities
      : [];

    let matches = rawEntities.filter((e) => (e.confidence ?? 1.0) >= minConfidence);

    if (lowerQuery) {
      matches = matches.filter(
        (e) =>
          (e.name && e.name.toLowerCase().includes(lowerQuery)) ||
          (e.kind && e.kind.toLowerCase().includes(lowerQuery)) ||
          (e.ontologyType && e.ontologyType.toLowerCase().includes(lowerQuery)) ||
          (e.description && e.description.toLowerCase().includes(lowerQuery)) ||
          (Array.isArray(e.aliases) && e.aliases.some((a: string) => a.toLowerCase().includes(lowerQuery))) ||
          (Array.isArray(e.tags) && e.tags.some((t: string) => t.toLowerCase().includes(lowerQuery)))
      );
    }

    const paged = matches.slice(0, limit);

    return {
      success: true,
      totalMatches: matches.length,
      returnedCount: paged.length,
      entities: paged.map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        ontologyType: e.ontologyType || e.kind || 'Component',
        category: e.category,
        description: e.description,
        confidence: e.confidence ?? 1.0,
        tags: e.tags || [],
        inferred: Boolean(e.inferred),
        evidenceCount: (e.evidence || []).length,
        evidence: (e.evidence || []).slice(0, 3).map((ev: any) => ({
          source: ev.source,
          origin: ev.origin,
          location: ev.location,
          confidence: ev.confidence ?? 1.0,
        })),
      })),
    };
  }
}
