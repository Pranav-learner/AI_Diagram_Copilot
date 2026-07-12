/**
 * Document-level operations — metadata and viewport. Viewport changes coalesce so
 * a pan/zoom gesture is a single history entry.
 */

import type { MetadataValue, Viewport } from '@/dsl';
import { operations } from '@/dsl';
import type { Operation } from './Operation';

export function updateDocumentMetadata(key: string, value: MetadataValue): Operation {
  return {
    type: 'document.metadata',
    label: 'Update metadata',
    validate: () => [],
    apply: (ctx) => operations.setDocumentMetadata(ctx.document, key, value, ctx.clock),
  };
}

export function changeViewport(patch: Partial<Viewport>): Operation {
  return {
    type: 'viewport.change',
    label: 'Change viewport',
    coalesceKey: 'viewport.change',
    validate: () => [],
    apply: (ctx) => operations.setViewport(ctx.document, patch, ctx.clock),
  };
}
