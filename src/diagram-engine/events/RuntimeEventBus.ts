/**
 * The runtime event bus — a typed {@link EventEmitter} over {@link RuntimeEventMap}.
 * A named class so the runtime can `new RuntimeEventBus()` and expose it directly.
 */

import { EventEmitter } from './EventEmitter';
import type { RuntimeEventMap } from './RuntimeEvents';

export class RuntimeEventBus extends EventEmitter<RuntimeEventMap> {}
