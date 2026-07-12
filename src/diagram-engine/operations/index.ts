/**
 * Built-in operations + the default {@link OperationRegistry} wiring.
 *
 * Callers normally import the typed factories directly (`moveNode(id, pos)`).
 * The registry maps each `type` to a params-driven factory for data-driven
 * producers (AI planner, serialized op log).
 */

import type {
  NodeId,
  EdgeId,
  GroupId,
  GroupChildId,
  Point,
  Size,
  Style,
  Metadata,
  MetadataValue,
  Viewport,
  NewNode,
  NewGroup,
  NodePatch,
  EdgePatch,
} from '@/dsl';
import { OperationRegistry } from '../runtime/OperationRegistry';
import type { EdgeSpec } from './edge';
import * as nodeOps from './node';
import * as edgeOps from './edge';
import * as groupOps from './group';
import * as documentOps from './document';

export type { Operation, OperationContext, OperationIssue } from './Operation';
export { opIssue } from './Operation';
export * from './node';
export * from './edge';
export * from './group';
export * from './document';

/** A registry preloaded with all built-in operations. */
export function createDefaultOperationRegistry(): OperationRegistry {
  const r = new OperationRegistry();

  // Nodes
  r.register('node.create', (p) => nodeOps.createNode(p.spec as NewNode, { id: p.id as NodeId | undefined }));
  r.register('node.delete', (p) => nodeOps.deleteNode(p.id as NodeId));
  r.register('node.move', (p) => nodeOps.moveNode(p.id as NodeId, p.position as Point));
  r.register('node.resize', (p) => nodeOps.resizeNode(p.id as NodeId, p.size as Size));
  r.register('node.rotate', (p) => nodeOps.rotateNode(p.id as NodeId, p.rotation as number));
  r.register('node.rename', (p) => nodeOps.renameNode(p.id as NodeId, p.text as string));
  r.register('node.style', (p) => nodeOps.updateNodeStyle(p.id as NodeId, p.style as Style));
  r.register('node.metadata', (p) => nodeOps.updateNodeMetadata(p.id as NodeId, p.metadata as Metadata));
  r.register('node.lock', (p) => nodeOps.setNodeLocked(p.id as NodeId, p.locked as boolean));
  r.register('node.update', (p) => nodeOps.updateNode(p.id as NodeId, p.patch as NodePatch));

  // Edges
  r.register('edge.connect', (p) =>
    edgeOps.connectNodes(p.source as NodeId, p.target as NodeId, p.spec as EdgeSpec | undefined, {
      id: p.id as EdgeId | undefined,
    }),
  );
  r.register('edge.disconnect', (p) => edgeOps.disconnectNodes(p.id as EdgeId));
  r.register('edge.update', (p) => edgeOps.updateEdge(p.id as EdgeId, p.patch as EdgePatch));

  // Groups
  r.register('group.create', (p) => groupOps.createGroup(p.spec as NewGroup | undefined, { id: p.id as GroupId | undefined }));
  r.register('group.ungroup', (p) => groupOps.ungroup(p.id as GroupId));
  r.register('group.add', (p) => groupOps.addToGroup(p.groupId as GroupId, p.childId as GroupChildId));
  r.register('group.remove', (p) => groupOps.removeFromGroup(p.groupId as GroupId, p.childId as GroupChildId));
  r.register('group.move', (p) => groupOps.moveGroup(p.groupId as GroupId, p.delta as { dx: number; dy: number }));

  // Document
  r.register('document.metadata', (p) => documentOps.updateDocumentMetadata(p.key as string, p.value as MetadataValue));
  r.register('viewport.change', (p) => documentOps.changeViewport(p.patch as Partial<Viewport>));

  return r;
}
