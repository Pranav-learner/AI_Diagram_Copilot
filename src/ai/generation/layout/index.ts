/**
 * Layout subsystem barrel + the default engine factory.
 */

export * from './types';
export * from './graph';
export { LayoutEngine } from './LayoutEngine';
export { layeredAlgorithm, treeAlgorithm, createDagreAlgorithm } from './algorithms/dagreLayout';
export { radialAlgorithm } from './algorithms/radial';
export { mindmapAlgorithm } from './algorithms/mindmap';
export { gridAlgorithm } from './algorithms/grid';
export { linearAlgorithm } from './algorithms/linear';
export { layoutTree } from './algorithms/hierarchyTree';

import { LayoutEngine } from './LayoutEngine';
import { layeredAlgorithm, treeAlgorithm } from './algorithms/dagreLayout';
import { radialAlgorithm } from './algorithms/radial';
import { mindmapAlgorithm } from './algorithms/mindmap';
import { gridAlgorithm } from './algorithms/grid';
import { linearAlgorithm } from './algorithms/linear';

/** A {@link LayoutEngine} preloaded with every built-in algorithm. */
export function createDefaultLayoutEngine(): LayoutEngine {
  return new LayoutEngine()
    .register(layeredAlgorithm)
    .register(treeAlgorithm)
    .register(radialAlgorithm)
    .register(mindmapAlgorithm)
    .register(gridAlgorithm)
    .register(linearAlgorithm)
    .setFallback('grid');
}
