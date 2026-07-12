/**
 * Validation vocabulary: stable machine-readable codes plus the result shape.
 *
 * Codes are stable string constants (not free text) so future modules can match
 * on them — e.g. an AI repair loop can react to `edge.danglingEndpoint`
 * specifically. Issues carry a `path` (dotted location) and optional `entityId`
 * for precise reporting.
 */

/** Stable validation issue codes. */
export const ValidationCode = {
  /** Document is structurally malformed (missing/mistyped required fields). */
  SchemaShape: 'schema.shape',
  /** A required field on an entity is missing. */
  MissingRequiredField: 'entity.missingRequiredField',
  /** The same id is used across multiple collections. */
  DuplicateId: 'entity.duplicateId',
  /** An entity's `id` field disagrees with its map key. */
  IdKeyMismatch: 'entity.idKeyMismatch',
  /** An edge endpoint references a node that does not exist. */
  DanglingEdgeEndpoint: 'edge.danglingEndpoint',
  /** A group lists a child id that does not resolve to a node or group. */
  MissingGroupChild: 'group.missingChild',
  /** Group nesting forms a cycle. */
  CircularGroup: 'group.circularNesting',
  /** A container node references a child node that does not exist. */
  MissingContainerChild: 'node.missingChild',
  /** A `styleRef` points at an undefined named style. */
  UnresolvedStyleRef: 'style.unresolvedRef',
  /** A `layerId` points at an undefined layer. */
  UnresolvedLayerRef: 'layer.unresolvedRef',
  /** A `tagId` points at an undefined tag. */
  UnresolvedTagRef: 'tag.unresolvedRef',
  /** An annotation/comment targets an entity that no longer exists. */
  OrphanTarget: 'annotation.orphanTarget',
} as const;

export type ValidationCode = (typeof ValidationCode)[keyof typeof ValidationCode];

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly severity: Severity;
  readonly message: string;
  /** Dotted path to the offending location, e.g. `edges.edge_1.source`. */
  readonly path: string;
  readonly entityId?: string;
}

export interface ValidationResult {
  /** True when there are no `error`-severity issues (warnings are allowed). */
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
}

export function issue(
  code: ValidationCode,
  message: string,
  path: string,
  options: { severity?: Severity; entityId?: string } = {},
): ValidationIssue {
  return {
    code,
    message,
    path,
    severity: options.severity ?? 'error',
    entityId: options.entityId,
  };
}
