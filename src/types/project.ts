/**
 * A diagram project. Timestamps are ISO 8601 strings so they serialize cleanly
 * across the (mocked) API boundary and into persisted stores.
 */
export interface Project {
  id: string;
  title: string;
  description: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-modified timestamp. */
  updatedAt: string;
  /**
   * Optional thumbnail URL. Null while diagram rendering is not implemented —
   * the UI shows a generated placeholder instead.
   */
  thumbnailUrl: string | null;
}

/** Fields a user can supply when creating a project. */
export interface CreateProjectInput {
  title: string;
  description?: string;
}

/** Fields a user can change on an existing project. */
export interface UpdateProjectInput {
  title?: string;
  description?: string;
}
