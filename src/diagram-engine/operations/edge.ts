/**
 * Edge operations — connect / disconnect / update. `connectNodes` validates that
 * both endpoints exist (no dangling edges) before building the edge.
 */

import type { NodeId, EdgeId, NewEdge, EdgePatch } from '@/dsl';
import { buildEdge, operations } from '@/dsl';
import type { Operation } from './Operation';
import * as V from '../validation/validators';

export type EdgeSpec = Partial<Omit<NewEdge, 'source' | 'target'>>;

export function connectNodes(
  source: NodeId,
  target: NodeId,
  spec: EdgeSpec = {},
  opts: { id?: EdgeId } = {},
): Operation {
  return {
    type: 'edge.connect',
    label: 'Connect nodes',
    validate: (ctx) => [
      ...V.nodeMustExist(ctx.document, source),
      ...V.nodeMustExist(ctx.document, target),
      ...(opts.id ? V.idMustBeFree(ctx.document, opts.id) : []),
    ],
    apply: (ctx) => {
      const edge = buildEdge(
        { ids: ctx.ids, clock: ctx.clock },
        { ...spec, source: { nodeId: source }, target: { nodeId: target } },
      );
      const withId = opts.id ? { ...edge, id: opts.id } : edge;
      return operations.addEdge(ctx.document, withId, ctx.clock);
    },
  };
}

export function disconnectNodes(edgeId: EdgeId): Operation {
  return {
    type: 'edge.disconnect',
    label: 'Disconnect nodes',
    validate: (ctx) => V.edgeMustExist(ctx.document, edgeId),
    apply: (ctx) => operations.removeEdge(ctx.document, edgeId, ctx.clock),
  };
}

export function updateEdge(id: EdgeId, patch: EdgePatch): Operation {
  return {
    type: 'edge.update',
    label: 'Update edge',
    validate: (ctx) => V.edgeMustExist(ctx.document, id),
    apply: (ctx) => operations.updateEdge(ctx.document, id, patch, ctx.clock),
  };
}
