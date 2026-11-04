/**
 * PimToDiagramAdapter — converts a ProjectIntelligenceModel (PIM) into a validated DiagramPlan.
 *
 * Deterministically projects entities, relationships, confidence, and evidence
 * into a semantic DiagramPlan for Dagre layout and canvas execution.
 */

import type { ProjectIntelligenceModel, PimEntity, PimRelation } from '../../project-intelligence/pim/ProjectIntelligenceModel';
import type { DiagramPlan, PlanNode, PlanRelationship } from './DiagramPlan';
import type { DiagramType, LayoutHint } from './DiagramType';

export type ArchitectureViewType =
  | 'architecture'
  | 'c4-container'
  | 'component'
  | 'dependencies'
  | 'erd'
  | 'api';

export interface PimToDiagramOptions {
  readonly viewType?: ArchitectureViewType;
  readonly title?: string;
  readonly maxNodes?: number;
  readonly minConfidence?: number;
}

export function pimToDiagramPlan(
  pim: ProjectIntelligenceModel,
  options: PimToDiagramOptions = {},
): DiagramPlan {
  const viewType = options.viewType ?? 'architecture';
  const minConfidence = options.minConfidence ?? 0.0;
  const maxNodes = options.maxNodes ?? 150;

  let entities = pim.entities().filter((e) => e.confidence >= minConfidence);
  let diagramType: DiagramType = 'architecture';
  let layout: LayoutHint = 'hierarchical';
  let title = options.title ?? `${pim.stats().entities}-Node System Topology`;

  switch (viewType) {
    case 'erd': {
      diagramType = 'erd';
      layout = 'grid';
      title = options.title ?? 'Database Entity-Relationship Model';
      entities = entities.filter(
        (e) =>
          e.kind === 'database' ||
          e.category === 'data' ||
          e.ontologyType === 'Database' ||
          e.ontologyType === 'Table' ||
          e.ontologyType === 'Model' ||
          e.tags.includes('database') ||
          e.tags.includes('sql')
      );
      break;
    }
    case 'c4-container': {
      diagramType = 'architecture';
      layout = 'hierarchical';
      title = options.title ?? 'C4 Container & Service Architecture';
      entities = entities.filter(
        (e) =>
          e.category === 'architecture' ||
          e.kind === 'service' ||
          e.kind === 'database' ||
          e.kind === 'gateway' ||
          e.kind === 'queue' ||
          e.kind === 'client' ||
          e.sourceKinds.includes('docker') ||
          e.sourceKinds.includes('kubernetes')
      );
      break;
    }
    case 'component': {
      diagramType = 'class';
      layout = 'tree';
      title = options.title ?? 'Software Component Structure';
      entities = entities.filter(
        (e) =>
          e.kind === 'component' ||
          e.kind === 'class' ||
          e.kind === 'interface' ||
          e.kind === 'service' ||
          e.category === 'code'
      );
      break;
    }
    case 'dependencies': {
      diagramType = 'network';
      layout = 'flow';
      title = options.title ?? 'Module & Dependency Graph';
      break;
    }
    case 'api': {
      diagramType = 'flowchart';
      layout = 'horizontal';
      title = options.title ?? 'API & Endpoint Routing Topology';
      entities = entities.filter(
        (e) =>
          e.kind === 'endpoint' ||
          e.kind === 'gateway' ||
          e.kind === 'service' ||
          e.category === 'api' ||
          e.sourceKinds.includes('openapi') ||
          e.sourceKinds.includes('graphql')
      );
      break;
    }
    default: {
      diagramType = 'architecture';
      layout = 'hierarchical';
      title = options.title ?? 'System Architecture Overview';
      break;
    }
  }

  // Fallback to all entities if the filtered subset is empty
  if (entities.length === 0) {
    entities = pim.entities();
  }

  // Bound node count
  if (entities.length > maxNodes) {
    entities = entities.slice(0, maxNodes);
  }

  const validEntityIds = new Set(entities.map((e) => e.id));

  // Build nodes
  const nodes: PlanNode[] = entities.map((e) => {
    const isLowConfidence = e.confidence < 0.7;
    const label = isLowConfidence && e.inferred ? `${e.name}*` : e.name;
    const desc = e.description || (e.inferred ? 'Inferred from architectural dependencies' : undefined);

    return {
      id: e.id,
      label,
      type: mapOntologyKindToNodeType(e),
      description: desc,
      metadata: {
        category: e.category,
        confidence: e.confidence,
        ontologyType: e.ontologyType,
        inferred: Boolean(e.inferred),
        sources: e.sourceKinds.join(', '),
      },
    };
  });

  // Build relationships (only between valid nodes)
  const relationships: PlanRelationship[] = pim
    .relations()
    .filter((r) => validEntityIds.has(r.source) && validEntityIds.has(r.target))
    .map((r) => ({
      source: r.source,
      target: r.target,
      label: r.kind,
      type: mapRelationKindToType(r.kind),
      description: r.confidence < 0.7 ? 'Inferred relationship' : undefined,
    }));

  return {
    diagramType,
    title,
    description: `Auto-generated from Project Intelligence Model (${nodes.length} entities, ${relationships.length} connections).`,
    layout,
    nodes,
    relationships,
  };
}

function mapOntologyKindToNodeType(e: PimEntity): string {
  const kind = (e.kind || '').toLowerCase();
  const ont = (e.ontologyType || '').toLowerCase();

  if (kind.includes('database') || ont.includes('database') || ont.includes('table')) {
    return 'database';
  }
  if (kind.includes('gateway') || ont.includes('gateway')) {
    return 'gateway';
  }
  if (kind.includes('queue') || kind.includes('topic') || ont.includes('queue')) {
    return 'queue';
  }
  if (kind.includes('cache')) {
    return 'cache';
  }
  if (kind.includes('client') || ont.includes('frontend')) {
    return 'client';
  }
  if (kind.includes('component') || kind.includes('class')) {
    return 'component';
  }
  return 'service';
}

function mapRelationKindToType(kind: string): PlanRelationship['type'] {
  switch (kind) {
    case 'dependsOn':
      return 'dependency';
    case 'calls':
    case 'exposes':
      return 'flow';
    case 'contains':
    case 'partOf':
      return 'contains';
    case 'owns':
      return 'composition';
    case 'implements':
      return 'inheritance';
    case 'references':
    case 'connectsTo':
    case 'deployedAs':
    case 'documents':
      return 'association';
    case 'relatedTo':
      return 'link';
    default:
      return 'flow';
  }
}

