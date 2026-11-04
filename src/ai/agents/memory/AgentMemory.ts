export interface AgentMemoryEntry {
  readonly key: string;
  readonly value: any;
  readonly agentId?: string;
  readonly timestamp: number;
  readonly tags: readonly string[];
}

export interface AgentHandoff {
  readonly fromAgentId: string;
  readonly toAgentId?: string;
  readonly missionId: string;
  readonly summary: string;
  readonly findings: Readonly<Record<string, any>>;
  readonly evidence: readonly any[];
  readonly timestamp: number;
}

export interface MissionMemoryState {
  readonly missionId: string;
  readonly entries: Record<string, AgentMemoryEntry>;
  readonly handoffs: AgentHandoff[];
  readonly updatedAt: number;
}

export interface AgentMemoryStore {
  save(missionId: string, state: MissionMemoryState): Promise<void>;
  load(missionId: string): Promise<MissionMemoryState | undefined>;
  delete(missionId: string): Promise<void>;
}

export class InMemoryAgentMemoryStore implements AgentMemoryStore {
  private readonly store = new Map<string, MissionMemoryState>();

  async save(missionId: string, state: MissionMemoryState): Promise<void> {
    this.store.set(missionId, JSON.parse(JSON.stringify(state)));
  }

  async load(missionId: string): Promise<MissionMemoryState | undefined> {
    const raw = this.store.get(missionId);
    return raw ? JSON.parse(JSON.stringify(raw)) : undefined;
  }

  async delete(missionId: string): Promise<void> {
    this.store.delete(missionId);
  }
}

export class LocalStorageAgentMemoryStore implements AgentMemoryStore {
  private readonly prefix: string;

  constructor(prefix = 'diagram_copilot_memory_') {
    this.prefix = prefix;
  }

  private isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  async save(missionId: string, state: MissionMemoryState): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      localStorage.setItem(`${this.prefix}${missionId}`, JSON.stringify(state));
    } catch {
      // Storage quota or serialization guard
    }
  }

  async load(missionId: string): Promise<MissionMemoryState | undefined> {
    if (!this.isAvailable()) return undefined;
    try {
      const raw = localStorage.getItem(`${this.prefix}${missionId}`);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  async delete(missionId: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      localStorage.removeItem(`${this.prefix}${missionId}`);
    } catch {
      // Storage guard
    }
  }
}

/**
 * Manages mission-scoped memory, context handoffs, and state persistence.
 */
export class AgentMemory {
  private readonly missionEntries = new Map<string, Map<string, AgentMemoryEntry>>();
  private readonly missionHandoffs = new Map<string, AgentHandoff[]>();
  private readonly defaultStore: AgentMemoryStore;

  constructor(defaultStore: AgentMemoryStore = new InMemoryAgentMemoryStore()) {
    this.defaultStore = defaultStore;
  }

  /**
   * Sets a memory item strictly within the specified mission scope.
   */
  set(
    missionId: string,
    key: string,
    value: any,
    options: { agentId?: string; tags?: string[] } = {}
  ): void {
    if (!missionId) {
      throw new Error('missionId is required for AgentMemory storage');
    }
    let entries = this.missionEntries.get(missionId);
    if (!entries) {
      entries = new Map();
      this.missionEntries.set(missionId, entries);
    }

    entries.set(key, {
      key,
      value,
      agentId: options.agentId,
      tags: options.tags || [],
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieves a memory item from the specified mission scope.
   */
  get<T = any>(missionId: string, key: string): T | undefined {
    const entries = this.missionEntries.get(missionId);
    return entries?.get(key)?.value;
  }

  /**
   * Checks if a key exists in mission scope.
   */
  has(missionId: string, key: string): boolean {
    return Boolean(this.missionEntries.get(missionId)?.has(key));
  }

  /**
   * Deletes a key from mission scope.
   */
  delete(missionId: string, key: string): boolean {
    const entries = this.missionEntries.get(missionId);
    if (!entries) return false;
    return entries.delete(key);
  }

  /**
   * Searches entries in mission scope by tag or key prefix.
   */
  search(
    missionId: string,
    query: { tag?: string; keyPrefix?: string }
  ): readonly AgentMemoryEntry[] {
    const entries = this.missionEntries.get(missionId);
    if (!entries) return [];

    let results = Array.from(entries.values());
    if (query.tag) {
      results = results.filter((e) => e.tags.includes(query.tag!));
    }
    if (query.keyPrefix) {
      results = results.filter((e) => e.key.startsWith(query.keyPrefix!));
    }
    return results;
  }

  /**
   * Records a context handoff between agents in a mission.
   */
  recordHandoff(handoff: Omit<AgentHandoff, 'timestamp'> & { timestamp?: number }): void {
    const missionId = handoff.missionId;
    if (!missionId) {
      throw new Error('missionId is required for recording an agent handoff');
    }

    let list = this.missionHandoffs.get(missionId);
    if (!list) {
      list = [];
      this.missionHandoffs.set(missionId, list);
    }

    const item: AgentHandoff = {
      ...handoff,
      timestamp: handoff.timestamp ?? Date.now(),
    };

    list.push(item);

    // Also index into key-value store for quick access
    this.set(missionId, `handoff:${handoff.fromAgentId}:${list.length}`, item, {
      agentId: handoff.fromAgentId,
      tags: ['handoff', handoff.fromAgentId, handoff.toAgentId || '*'],
    });
  }

  /**
   * Gets handoffs recorded in a mission, optionally filtered by sender or receiver.
   */
  getHandoffs(
    missionId: string,
    filter?: { fromAgentId?: string; toAgentId?: string }
  ): readonly AgentHandoff[] {
    const list = this.missionHandoffs.get(missionId) || [];
    if (!filter) return list;

    return list.filter((h) => {
      if (filter.fromAgentId && h.fromAgentId !== filter.fromAgentId) return false;
      if (filter.toAgentId && h.toAgentId && h.toAgentId !== filter.toAgentId && h.toAgentId !== '*') {
        return false;
      }
      return true;
    });
  }

  /**
   * Aggregates upstream handoff context tailored for a target downstream agent.
   * e.g. ArchitectureAgent -> SecurityAgent -> ReviewerAgent -> DocumentationAgent
   */
  getHandoffContextForAgent(missionId: string, targetAgentId: string): Record<string, any> {
    const handoffs = this.getHandoffs(missionId, { toAgentId: targetAgentId });
    const contextMap: Record<string, any> = {};

    for (const h of handoffs) {
      contextMap[h.fromAgentId] = {
        summary: h.summary,
        findings: h.findings,
        evidence: h.evidence,
        timestamp: h.timestamp,
      };
    }

    return contextMap;
  }

  /**
   * Clears memory. If missionId is given, clears only that mission. Otherwise clears all.
   */
  clear(missionId?: string): void {
    if (missionId) {
      this.missionEntries.delete(missionId);
      this.missionHandoffs.delete(missionId);
    } else {
      this.missionEntries.clear();
      this.missionHandoffs.clear();
    }
  }

  /**
   * Exports full memory state of a mission.
   */
  exportState(missionId: string): MissionMemoryState {
    const entriesMap = this.missionEntries.get(missionId) || new Map();
    const entriesObj: Record<string, AgentMemoryEntry> = {};
    for (const [k, v] of entriesMap.entries()) {
      entriesObj[k] = v;
    }

    return {
      missionId,
      entries: entriesObj,
      handoffs: [...(this.missionHandoffs.get(missionId) || [])],
      updatedAt: Date.now(),
    };
  }

  /**
   * Imports a mission state snapshot into memory.
   */
  importState(state: MissionMemoryState): void {
    const entriesMap = new Map<string, AgentMemoryEntry>();
    for (const [k, v] of Object.entries(state.entries || {})) {
      entriesMap.set(k, v);
    }
    this.missionEntries.set(state.missionId, entriesMap);
    this.missionHandoffs.set(state.missionId, [...(state.handoffs || [])]);
  }

  /**
   * Saves mission memory state using the provided or default store.
   */
  async save(missionId: string, store?: AgentMemoryStore): Promise<void> {
    const targetStore = store || this.defaultStore;
    const state = this.exportState(missionId);
    await targetStore.save(missionId, state);
  }

  /**
   * Loads mission memory state using the provided or default store.
   */
  async load(missionId: string, store?: AgentMemoryStore): Promise<boolean> {
    const targetStore = store || this.defaultStore;
    const state = await targetStore.load(missionId);
    if (!state) return false;

    this.importState(state);
    return true;
  }
}

