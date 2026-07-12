/**
 * Node operations. Each is a small factory returning an immutable {@link Operation}.
 * `apply` delegates to the DSL's pure `operations` + builders, so cascades and
 * normalization are inherited. Geometry ops carry a `coalesceKey` so a drag's
 * many intermediate moves compress into one history entry.
 */

import type { NodeId, Point, Size, Style, Metadata, NewNode, NodePatch } from '@/dsl';
import { buildNode, operations } from '@/dsl';
import type { Operation } from './Operation';
import * as V from '../validation/validators';

export function createNode(spec: NewNode, opts: { id?: NodeId } = {}): Operation {
  return {
    type: 'node.create',
    label: 'Create node',
    validate: (ctx) => (opts.id ? V.idMustBeFree(ctx.document, opts.id) : []),
    apply: (ctx) => {
      const node = buildNode({ ids: ctx.ids, clock: ctx.clock }, spec, ctx.registry);
      const withId = opts.id ? { ...node, id: opts.id } : node;
      return operations.addNode(ctx.document, withId, ctx.clock);
    },
  };
}

export function deleteNode(id: NodeId): Operation {
  return {
    type: 'node.delete',
    label: 'Delete node',
    validate: (ctx) => V.nodeMustExist(ctx.document, id),
    apply: (ctx) => operations.removeNode(ctx.document, id, ctx.clock),
  };
}

export function moveNode(id: NodeId, position: Point): Operation {
  return {
    type: 'node.move',
    label: 'Move node',
    coalesceKey: `node.move:${id}`,
    validate: (ctx) => [...V.nodeMustExist(ctx.document, id), ...V.nodeNotLocked(ctx.document, id)],
    apply: (ctx) => operations.updateNode(ctx.document, id, { position }, ctx.clock),
  };
}

export function resizeNode(id: NodeId, size: Size): Operation {
  return {
    type: 'node.resize',
    label: 'Resize node',
    coalesceKey: `node.resize:${id}`,
    validate: (ctx) => [...V.nodeMustExist(ctx.document, id), ...V.nodeNotLocked(ctx.document, id)],
    apply: (ctx) => operations.updateNode(ctx.document, id, { size }, ctx.clock),
  };
}

export function rotateNode(id: NodeId, rotation: number): Operation {
  return {
    type: 'node.rotate',
    label: 'Rotate node',
    coalesceKey: `node.rotate:${id}`,
    validate: (ctx) => [...V.nodeMustExist(ctx.document, id), ...V.nodeNotLocked(ctx.document, id)],
    apply: (ctx) => operations.updateNode(ctx.document, id, { rotation }, ctx.clock),
  };
}

export function renameNode(id: NodeId, text: string): Operation {
  return {
    type: 'node.rename',
    label: 'Rename node',
    validate: (ctx) => V.nodeMustExist(ctx.document, id),
    apply: (ctx) => {
      const existing = ctx.document.nodes[id];
      const label = { ...(existing?.label ?? {}), text };
      return operations.updateNode(ctx.document, id, { label }, ctx.clock);
    },
  };
}

export function updateNodeStyle(id: NodeId, style: Style): Operation {
  return {
    type: 'node.style',
    label: 'Update style',
    validate: (ctx) => V.nodeMustExist(ctx.document, id),
    apply: (ctx) => operations.updateNode(ctx.document, id, { style }, ctx.clock),
  };
}

export function updateNodeMetadata(id: NodeId, metadata: Metadata): Operation {
  return {
    type: 'node.metadata',
    label: 'Update node metadata',
    validate: (ctx) => V.nodeMustExist(ctx.document, id),
    apply: (ctx) => operations.updateNode(ctx.document, id, { metadata }, ctx.clock),
  };
}

export function setNodeLocked(id: NodeId, locked: boolean): Operation {
  return {
    type: 'node.lock',
    label: locked ? 'Lock node' : 'Unlock node',
    validate: (ctx) => V.nodeMustExist(ctx.document, id),
    apply: (ctx) => operations.updateNode(ctx.document, id, { locked }, ctx.clock),
  };
}

/** Generic node update — used by canvas-diff derivation for multi-field changes. */
export function updateNode(id: NodeId, patch: NodePatch): Operation {
  return {
    type: 'node.update',
    label: 'Update node',
    validate: (ctx) => V.nodeMustExist(ctx.document, id),
    apply: (ctx) => operations.updateNode(ctx.document, id, patch, ctx.clock),
  };
}
