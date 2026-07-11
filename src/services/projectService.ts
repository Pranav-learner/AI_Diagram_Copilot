import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '@/types';
import { SEED_PROJECTS } from './mockData';

/**
 * Mock project API.
 *
 * This module simulates the FastAPI + PostgreSQL backend that will be wired up
 * in a later module. It keeps an in-memory collection and returns Promises with
 * artificial latency so the UI exercises real loading and error states. The
 * TanStack Query hooks in `hooks/useProjects` are the only consumers — swapping
 * this file for real `fetch` calls later requires no changes upstream.
 */

const LATENCY_MS = 450;

// Cloned so mutations never leak back into the immutable seed array.
let db: Project[] = SEED_PROJECTS.map((p) => ({ ...p }));

function delay<T>(value: T, ms: number = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Reasonably unique id without pulling in a uuid dependency. */
function generateId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `prj_${time}${rand}`;
}

export const projectService = {
  async list(): Promise<Project[]> {
    return delay(db.map((p) => ({ ...p })));
  },

  async get(id: string): Promise<Project | null> {
    const found = db.find((p) => p.id === id);
    return delay(found ? { ...found } : null);
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const timestamp = nowIso();
    const project: Project = {
      id: generateId(),
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
      thumbnailUrl: null,
    };
    db = [project, ...db];
    return delay({ ...project });
  },

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const index = db.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Project ${id} not found`);
    }
    const existing = db[index]!;
    const updated: Project = {
      ...existing,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() }
        : {}),
      updatedAt: nowIso(),
    };
    db = db.map((p) => (p.id === id ? updated : p));
    return delay({ ...updated });
  },

  async duplicate(id: string): Promise<Project> {
    const source = db.find((p) => p.id === id);
    if (!source) {
      throw new Error(`Project ${id} not found`);
    }
    const timestamp = nowIso();
    const copy: Project = {
      ...source,
      id: generateId(),
      title: `${source.title} (Copy)`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    db = [copy, ...db];
    return delay({ ...copy });
  },

  async remove(id: string): Promise<{ id: string }> {
    db = db.filter((p) => p.id !== id);
    return delay({ id });
  },
};
