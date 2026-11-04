/**
 * PimToDiagramAdapter — converts a ProjectIntelligenceModel (PIM) into a clean,
 * human-readable, beautifully spaced DiagramPlan.
 *
 * Implements architectural tiering and relationship pruning to avoid graph
 * hairballs ("spaghetti diagrams"), producing structured, easily understood
 * system architecture, component, and data models.
 */

import type { ProjectIntelligenceModel, PimEntity } from '../../project-intelligence/pim/ProjectIntelligenceModel';
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

const THIRD_PARTY_PACKAGES = new Set([
  'fastapi', 'pydantic', 'pydantic_settings', 'sqlalchemy', 'alembic',
  'pytest', 'uvicorn', 'passlib', 'jose', 'jwt', 'python-jose', 'os',
  'sys', 'json', 'pathlib', 'asyncio', 'datetime', 'time', 'logging',
  'starlette', 'requests', 'httpx', 'dotenv', 'typing', 'typing_extensions',
  'uuid', 're', 'hashlib', 'base64', 'unittest', 'dataclasses', 'abc',
]);

function isThirdPartyLibrary(e: PimEntity): boolean {
  const name = e.name.toLowerCase().trim();
  if (THIRD_PARTY_PACKAGES.has(name)) return true;
  if (e.sourceKinds.includes('package') && !e.sourceKinds.includes('code')) return true;
  return false;
}

function isMicroEndpoint(e: PimEntity): boolean {
  const name = e.name.trim();
  return (
    e.kind === 'endpoint' ||
    name.startsWith('GET ') ||
    name.startsWith('POST ') ||
    name.startsWith('PUT ') ||
    name.startsWith('DELETE ') ||
    name.startsWith('PATCH ') ||
    name.startsWith('OPTIONS ') ||
    name.startsWith('HEAD ')
  );
}

function isStructuralFolderWrapper(e: PimEntity): boolean {
  const name = e.name.toLowerCase().trim();
  return (
    name === 'app' ||
    name === 'src' ||
    name === 'root' ||
    name === 'app.models' ||
    name === 'models' ||
    name === 'schemas' ||
    name === 'app.schemas' ||
    name === 'app.handlers' ||
    name === 'handlers' ||
    name === 'exceptions' ||
    name === 'app.exceptions'
  );
}

function cleanHumanLabel(name: string): string {
  const n = name.trim();
  if (n === 'main' || n === 'main.py') return 'FastAPI Application (main.py)';
  if (n.includes('routers.tasks') || n.includes('tasks.py')) return 'Tasks Router (tasks.py)';
  if (n.includes('routers.auth') || n.includes('auth.py')) return 'Auth Router (auth.py)';
  if (n.includes('services.task_service') || n === 'TaskService' || n === 'task_service') return 'Task Service';
  if (n.includes('services.auth_service') || n === 'AuthService' || n === 'auth_service') return 'Auth Service';
  if (n.includes('services.user_service') || n === 'UserService' || n === 'user_service') return 'User Service';
  if (n.includes('repositories.task_repository') || n === 'TaskRepository' || n === 'task_repository') return 'Task Repository';
  if (n.includes('repositories.user_repository') || n === 'UserRepository' || n === 'user_repository') return 'User Repository';
  if (n === 'database' || n.includes('db.database')) return 'Database Session Engine';
  if (n.includes('db.base') || n === 'Base') return 'SQLAlchemy Base Model';
  if (n.includes('models.task') || n === 'Task' || n === 'TaskModel') return 'Task Data Model';
  if (n.includes('models.user') || n === 'User' || n === 'UserModel') return 'User Data Model';
  if (n.includes('config')) return 'Application Config (config.py)';
  return n;
}

function getEntityTier(e: PimEntity): number {
  const name = e.name.toLowerCase();
  const kind = (e.kind || '').toLowerCase();
  const ont = (e.ontologyType || '').toLowerCase();

  // Tier 0: Ingress / Gateway / Entrypoint
  if (name === 'main' || name.includes('main.py') || kind === 'gateway' || ont.includes('gateway')) {
    return 0;
  }
  // Tier 1: Routers / Controllers
  if (name.includes('router') || name.includes('controller') || kind === 'router' || ont.includes('router')) {
    return 1;
  }
  // Tier 2: Domain Services
  if (name.includes('service') || kind === 'service' || ont.includes('service')) {
    return 2;
  }
  // Tier 3: Repositories & Data Access
  if (name.includes('repository') || name.includes('dao') || kind === 'repository' || ont.includes('repository')) {
    return 3;
  }
  // Tier 4: Database & Persistence Models
  if (kind === 'database' || ont.includes('database') || ont.includes('table') || ont.includes('model') || name.includes('model') || name.includes('db.')) {
    return 4;
  }
  // Tier 5: Config / Cross-cutting
  return 5;
}

export function pimToDiagramPlan(
  pim: ProjectIntelligenceModel,
  options: PimToDiagramOptions = {},
): DiagramPlan {
  const viewType = options.viewType ?? 'architecture';
  const minConfidence = options.minConfidence ?? 0.0;
  const maxNodes = options.maxNodes ?? 14;

  let entities = pim.entities().filter((e) => e.confidence >= minConfidence);
  let diagramType: DiagramType = 'architecture';
  let layout: LayoutHint = 'hierarchical';
  let title = options.title ?? 'System Architecture Overview';

  switch (viewType) {
    case 'erd': {
      diagramType = 'erd';
      layout = 'grid';
      title = options.title ?? 'Database Entity-Relationship Model';
      entities = entities.filter(
        (e) =>
          !isThirdPartyLibrary(e) &&
          (e.kind === 'database' ||
            e.category === 'data' ||
            e.ontologyType === 'Database' ||
            e.ontologyType === 'Table' ||
            e.ontologyType === 'Model' ||
            e.name.toLowerCase().includes('model') ||
            e.tags.includes('database') ||
            e.tags.includes('sql')),
      );
      break;
    }
    case 'api': {
      diagramType = 'flowchart';
      layout = 'horizontal';
      title = options.title ?? 'API & Endpoint Routing Topology';
      entities = entities.filter(
        (e) =>
          !isThirdPartyLibrary(e) &&
          (e.kind === 'endpoint' ||
            e.kind === 'gateway' ||
            e.kind === 'service' ||
            e.category === 'api' ||
            e.name.includes('router') ||
            isMicroEndpoint(e)),
      );
      break;
    }
    case 'component': {
      diagramType = 'class';
      layout = 'tree';
      title = options.title ?? 'Software Component Structure';
      entities = entities.filter(
        (e) =>
          !isThirdPartyLibrary(e) &&
          !isMicroEndpoint(e) &&
          (e.kind === 'component' ||
            e.kind === 'class' ||
            e.kind === 'service' ||
            e.kind === 'repository' ||
            e.name.includes('Service') ||
            e.name.includes('Repository')),
      );
      break;
    }
    case 'c4-container': {
      diagramType = 'architecture';
      layout = 'hierarchical';
      title = options.title ?? 'C4 Container & Service Architecture';
      entities = entities.filter(
        (e) =>
          !isThirdPartyLibrary(e) &&
          !isMicroEndpoint(e) &&
          (e.category === 'architecture' ||
            e.kind === 'service' ||
            e.kind === 'database' ||
            e.kind === 'gateway' ||
            e.name === 'main' ||
            e.name.includes('Service') ||
            e.name.includes('Repository') ||
            e.name.includes('db')),
      );
      break;
    }
    case 'dependencies': {
      diagramType = 'network';
      layout = 'flow';
      title = options.title ?? 'Module & Dependency Graph';
      entities = entities.filter((e) => !isThirdPartyLibrary(e));
      break;
    }
    default: {
      // 'architecture' view — structured, high-signal, tiered view
      diagramType = 'architecture';
      layout = 'hierarchical';
      title = options.title ?? 'Layered System Architecture';
      entities = entities.filter(
        (e) => !isThirdPartyLibrary(e) && !isMicroEndpoint(e) && !isStructuralFolderWrapper(e),
      );
      break;
    }
  }

  // Deduplicate entities that map to the same human label (e.g. module vs class with same name)
  const labelToEntity = new Map<string, PimEntity>();
  for (const ent of entities) {
    if (isStructuralFolderWrapper(ent)) continue;
    const label = cleanHumanLabel(ent.name);
    const existing = labelToEntity.get(label);
    if (!existing || (ent.confidence || 0) > (existing.confidence || 0)) {
      labelToEntity.set(label, ent);
    }
  }
  entities = Array.from(labelToEntity.values());

  // Fallback if filtering produced too few entities
  if (entities.length < 2) {
    entities = pim.entities().filter((e) => !isThirdPartyLibrary(e) && !isStructuralFolderWrapper(e));
    if (entities.length < 2) {
      entities = [...pim.entities()];
    }
  }

  // Group entities by tier and pick clean, balanced representative components
  const tierBuckets: Record<number, PimEntity[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const ent of entities) {
    const tier = getEntityTier(ent);
    tierBuckets[tier]?.push(ent);
  }

  const selectedEntities: PimEntity[] = [];
  const maxPerTier = Math.max(2, Math.floor(maxNodes / 4));

  for (let t = 0; t <= 5; t++) {
    const bucket = tierBuckets[t] ?? [];
    // Prioritize entities with source code evidence and higher confidence
    bucket.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    selectedEntities.push(...bucket.slice(0, maxPerTier));
  }

  // Ensure total nodes don't exceed maxNodes, but maintain minimum for meaningful layout
  const finalEntities = selectedEntities.slice(0, maxNodes);
  const validEntityIds = new Set(finalEntities.map((e) => e.id));
  const entityTierMap = new Map<string, number>();
  for (const ent of finalEntities) {
    entityTierMap.set(ent.id, getEntityTier(ent));
  }

  // Build clean nodes
  const nodes: PlanNode[] = finalEntities.map((e) => {
    return {
      id: e.id,
      label: cleanHumanLabel(e.name),
      type: mapOntologyKindToNodeType(e),
      description: e.description || `Component in tier ${entityTierMap.get(e.id)}`,
      metadata: {
        category: e.category,
        confidence: e.confidence,
        ontologyType: e.ontologyType,
        tier: entityTierMap.get(e.id) ?? 0,
      },
    };
  });

  // Build clean, directed relationships (eliminate hairballs & reverse-rank cycles)
  const relationships: PlanRelationship[] = [];
  const seenPair = new Set<string>();
  const outDegree = new Map<string, number>();

  // 1. First, include ground-truth relationships from PIM that flow downward or peer-to-peer
  for (const r of pim.relations()) {
    if (!validEntityIds.has(r.source) || !validEntityIds.has(r.target)) continue;
    if (r.source === r.target) continue;

    const sourceTier = entityTierMap.get(r.source) ?? 0;
    const targetTier = entityTierMap.get(r.target) ?? 0;

    // Prune upward edges that create spaghetti cycles in Dagre
    if (sourceTier > targetTier) continue;

    const pairKey = `${r.source}->${r.target}`;
    if (seenPair.has(pairKey)) continue;

    const currentOut = outDegree.get(r.source) ?? 0;
    if (currentOut >= 2) continue; // bound fan-out per node to keep diagram clean

    seenPair.add(pairKey);
    outDegree.set(r.source, currentOut + 1);

    relationships.push({
      source: r.source,
      target: r.target,
      type: mapRelationKindToType(r.kind),
      direction: 'forward',
    });
  }

  // 2. Synthesize clean tier-to-tier connections if any tier is disconnected
  const tierNodes: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const n of nodes) {
    const t = entityTierMap.get(n.id) ?? 0;
    tierNodes[t]?.push(n.id);
  }

  const activeTiers = [0, 1, 2, 3, 4, 5].filter((t) => (tierNodes[t]?.length ?? 0) > 0);

  for (let i = 0; i < activeTiers.length - 1; i++) {
    const currentTier = activeTiers[i]!;
    const nextTier = activeTiers[i + 1]!;
    const sources = tierNodes[currentTier] ?? [];
    const targets = tierNodes[nextTier] ?? [];

    for (const src of sources) {
      const currentOut = outDegree.get(src) ?? 0;
      if (currentOut === 0 && targets.length > 0) {
        // Connect to first target in next tier to maintain cohesive top-down flow
        const target = targets[0]!;
        const pairKey = `${src}->${target}`;
        if (!seenPair.has(pairKey)) {
          seenPair.add(pairKey);
          outDegree.set(src, currentOut + 1);
          relationships.push({
            source: src,
            target,
            type: 'flow',
            direction: 'forward',
          });
        }
      }
    }
  }

  return {
    diagramType,
    title,
    description: `Clean architecture view with ${nodes.length} components and ${relationships.length} directional flows.`,
    layout,
    nodes,
    relationships,
  };
}

function mapOntologyKindToNodeType(e: PimEntity): string {
  const name = e.name.toLowerCase();
  const kind = (e.kind || '').toLowerCase();
  const ont = (e.ontologyType || '').toLowerCase();

  if (kind.includes('database') || ont.includes('database') || ont.includes('table') || name.includes('db')) {
    return 'database';
  }
  if (kind.includes('gateway') || ont.includes('gateway') || name === 'main') {
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
  if (name.includes('router') || kind === 'router') {
    return 'gateway';
  }
  if (name.includes('service') || kind === 'service') {
    return 'service';
  }
  if (name.includes('repository') || kind === 'repository') {
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

export const PimToDiagramAdapter = {
  generate(pim: ProjectIntelligenceModel, viewType: ArchitectureViewType = 'architecture') {
    const plan = pimToDiagramPlan(pim, { viewType });
    return {
      plan,
      elementCount: plan.nodes.length,
      relationshipCount: plan.relationships.length,
    };
  },
};
