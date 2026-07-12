/**
 * Group operations — create / ungroup / membership / move. `addToGroup` guards
 * against circular parent hierarchies; `moveGroup` translates every member node
 * (recursively through nested groups).
 */

import type { DiagramDocument, NodeId, GroupId, GroupChildId, NewGroup } from '@/dsl';
import { buildGroup, operations } from '@/dsl';
import type { Operation } from './Operation';
import * as V from '../validation/validators';

export function createGroup(spec: NewGroup = {}, opts: { id?: GroupId } = {}): Operation {
  return {
    type: 'group.create',
    label: 'Create group',
    validate: (ctx) => (opts.id ? V.idMustBeFree(ctx.document, opts.id) : []),
    apply: (ctx) => {
      const group = buildGroup({ ids: ctx.ids, clock: ctx.clock }, spec);
      const withId = opts.id ? { ...group, id: opts.id } : group;
      return operations.addGroup(ctx.document, withId, ctx.clock);
    },
  };
}

export function ungroup(groupId: GroupId): Operation {
  return {
    type: 'group.ungroup',
    label: 'Ungroup',
    validate: (ctx) => V.groupMustExist(ctx.document, groupId),
    apply: (ctx) => operations.removeGroup(ctx.document, groupId, ctx.clock),
  };
}

export function addToGroup(groupId: GroupId, childId: GroupChildId): Operation {
  return {
    type: 'group.add',
    label: 'Add to group',
    validate: (ctx) => [
      ...V.groupMustExist(ctx.document, groupId),
      ...V.childMustExist(ctx.document, childId),
      ...V.noCircularGroup(ctx.document, groupId, childId),
    ],
    apply: (ctx) => operations.addToGroup(ctx.document, groupId, childId, ctx.clock),
  };
}

export function removeFromGroup(groupId: GroupId, childId: GroupChildId): Operation {
  return {
    type: 'group.remove',
    label: 'Remove from group',
    validate: (ctx) => V.groupMustExist(ctx.document, groupId),
    apply: (ctx) => operations.removeFromGroup(ctx.document, groupId, childId, ctx.clock),
  };
}

/** Collect every node id in a group, recursively through nested groups. */
function memberNodeIds(doc: DiagramDocument, groupId: string): NodeId[] {
  const result: NodeId[] = [];
  const stack: string[] = [groupId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const group = doc.groups[current];
    if (!group) continue;
    for (const child of group.childIds) {
      if (child in doc.nodes) result.push(child as NodeId);
      else if (child in doc.groups) stack.push(child);
    }
  }
  return result;
}

export function moveGroup(groupId: GroupId, delta: { dx: number; dy: number }): Operation {
  return {
    type: 'group.move',
    label: 'Move group',
    coalesceKey: `group.move:${groupId}`,
    validate: (ctx) => V.groupMustExist(ctx.document, groupId),
    apply: (ctx) => {
      let doc = ctx.document;
      for (const nodeId of memberNodeIds(doc, groupId)) {
        const node = doc.nodes[nodeId];
        if (!node) continue;
        doc = operations.updateNode(
          doc,
          nodeId,
          { position: { x: node.position.x + delta.dx, y: node.position.y + delta.dy } },
          ctx.clock,
        );
      }
      return doc;
    },
  };
}
