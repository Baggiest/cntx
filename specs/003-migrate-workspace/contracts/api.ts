/**
 * Migration API Contracts
 *
 * TypeScript interfaces for the migrate-session and migrate commands.
 * These define the library API surface for programmatic migration.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Migration mode: move removes from source, copy keeps source intact
 */
export type MigrationMode = 'move' | 'copy';

/**
 * Error codes for migration failures
 */
export type MigrationErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'WORKSPACE_NOT_FOUND'
  | 'SAME_WORKSPACE'
  | 'DATABASE_LOCKED'
  | 'PERMISSION_DENIED'
  | 'MIGRATION_FAILED';

// ============================================================================
// Session-Level Migration (Core Primitive)
// ============================================================================

/**
 * Options for migrating one or more sessions by ID/index
 */
export interface MigrateSessionOptions {
  /**
   * Session identifier(s) to migrate.
   * Can be:
   * - Single session ID (UUID): "abc123-def456"
   * - Single index (1-based): "3" or 3
   * - Multiple comma-separated: "1,3,5" or "abc123,def456"
   * - Array of IDs/indices: ["1", "3"] or [1, 3]
   */
  sessions: string | number | (string | number)[];

  /**
   * Destination workspace path (absolute or relative)
   */
  destination: string;

  /**
   * Migration mode: 'move' (default) or 'copy'
   * - move: Remove session from source, add to destination
   * - copy: Keep session in source, add copy to destination (new ID)
   */
  mode?: MigrationMode;

  /**
   * If true, show what would happen without making changes
   */
  dryRun?: boolean;

  /**
   * If true, proceed even if destination has existing history
   */
  force?: boolean;

  /**
   * Custom Cursor data path (optional, uses default if not specified)
   */
  dataPath?: string;
}

/**
 * Result of migrating a single session
 */
export interface SessionMigrationResult {
  /** Whether migration succeeded */
  success: boolean;

  /** Original session ID */
  sessionId: string;

  /** Source workspace path */
  sourceWorkspace: string;

  /** Destination workspace path */
  destinationWorkspace: string;

  /** Mode used for migration */
  mode: MigrationMode;

  /** For copy mode: the new session ID created */
  newSessionId?: string;

  /** Error details if success is false */
  error?: MigrationError;

  /** Whether this was a dry run */
  dryRun: boolean;
}

// ============================================================================
// Workspace-Level Migration (Wrapper)
// ============================================================================

/**
 * Options for migrating all sessions from one workspace to another
 */
export interface MigrateWorkspaceOptions {
  /**
   * Source workspace path to migrate from (exact match)
   */
  source: string;

  /**
   * Destination workspace path to migrate to
   */
  destination: string;

  /**
   * Migration mode: 'move' (default) or 'copy'
   */
  mode?: MigrationMode;

  /**
   * If true, show what would happen without making changes
   */
  dryRun?: boolean;

  /**
   * If true, proceed even if destination has existing history
   */
  force?: boolean;

  /**
   * Custom Cursor data path (optional)
   */
  dataPath?: string;
}

/**
 * Aggregate result of workspace migration
 */
export interface WorkspaceMigrationResult {
  /** True if all sessions migrated successfully */
  success: boolean;

  /** Normalized source path */
  source: string;

  /** Normalized destination path */
  destination: string;

  /** Mode used for migration */
  mode: MigrationMode;

  /** Total number of sessions attempted */
  totalSessions: number;

  /** Number of successful migrations */
  successCount: number;

  /** Number of failed migrations */
  failureCount: number;

  /** Per-session results */
  results: SessionMigrationResult[];

  /** Whether this was a dry run */
  dryRun: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Detailed error information for migration failures
 */
export interface MigrationError {
  /** Error code for programmatic handling */
  code: MigrationErrorCode;

  /** Human-readable error message */
  message: string;

  /** Session ID that failed (if applicable) */
  sessionId?: string;

  /** Additional error context */
  details?: Record<string, unknown>;
}

/**
 * Error thrown when a session ID/index cannot be resolved
 */
export class SessionNotFoundError extends Error {
  readonly code = 'SESSION_NOT_FOUND' as const;
  constructor(public readonly identifier: string | number) {
    super(`Session not found: ${identifier}`);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error thrown when destination workspace path has no workspace directory
 */
export class WorkspaceNotFoundError extends Error {
  readonly code = 'WORKSPACE_NOT_FOUND' as const;
  constructor(public readonly path: string) {
    super(`No workspace found for path: ${path}. Please open the project in Cursor first.`);
    this.name = 'WorkspaceNotFoundError';
  }
}

/**
 * Error thrown when source and destination are the same
 */
export class SameWorkspaceError extends Error {
  readonly code = 'SAME_WORKSPACE' as const;
  constructor(public readonly path: string) {
    super(`Source and destination are the same: ${path}`);
    this.name = 'SameWorkspaceError';
  }
}

// ============================================================================
// Library API Functions
// ============================================================================

/**
 * Migrate one or more sessions to a new workspace.
 *
 * This is the core primitive - migrateWorkspace() uses this internally.
 *
 * @example
 * // Move a single session by index
 * const result = migrateSession({ sessions: 1, destination: '/new/project' });
 *
 * @example
 * // Move multiple sessions
 * const result = migrateSession({ sessions: '1,3,5', destination: '/new/project' });
 *
 * @example
 * // Copy a session (keeps original)
 * const result = migrateSession({
 *   sessions: 'abc123',
 *   destination: '/new/project',
 *   mode: 'copy'
 * });
 *
 * @example
 * // Dry run to preview
 * const result = migrateSession({
 *   sessions: 1,
 *   destination: '/new/project',
 *   dryRun: true
 * });
 */
export declare function migrateSession(
  options: MigrateSessionOptions
): SessionMigrationResult[];

/**
 * Migrate all sessions from one workspace to another.
 *
 * Internally calls migrateSession() for each session found in the source workspace.
 *
 * @example
 * // Move all history from old project to new
 * const result = migrateWorkspace({
 *   source: '/old/project',
 *   destination: '/new/project'
 * });
 *
 * @example
 * // Copy all history (backup)
 * const result = migrateWorkspace({
 *   source: '/project',
 *   destination: '/project-backup',
 *   mode: 'copy'
 * });
 *
 * @example
 * // Force migration even if destination has sessions
 * const result = migrateWorkspace({
 *   source: '/old/project',
 *   destination: '/existing/project',
 *   force: true
 * });
 */
export declare function migrateWorkspace(
  options: MigrateWorkspaceOptions
): WorkspaceMigrationResult;

// ============================================================================
// Type Guards
// ============================================================================

export function isSessionNotFoundError(err: unknown): err is SessionNotFoundError {
  return err instanceof Error && err.name === 'SessionNotFoundError';
}

export function isWorkspaceNotFoundError(err: unknown): err is WorkspaceNotFoundError {
  return err instanceof Error && err.name === 'WorkspaceNotFoundError';
}

export function isSameWorkspaceError(err: unknown): err is SameWorkspaceError {
  return err instanceof Error && err.name === 'SameWorkspaceError';
}
