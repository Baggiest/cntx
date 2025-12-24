/**
 * Custom error classes for library API
 *
 * IMPORTANT: This is a library interface for direct import and use in TypeScript/JavaScript
 * projects, NOT a network/REST API.
 */

/**
 * Thrown when database is locked by Cursor or another process.
 *
 * Recovery: Close Cursor IDE and retry, or implement custom retry logic.
 */
export class DatabaseLockedError extends Error {
  name = 'DatabaseLockedError' as const;

  /** Path to locked database file */
  path: string;

  constructor(path: string) {
    super(`Database is locked: ${path}. Close Cursor or retry later.`);
    this.path = path;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseLockedError);
    }
  }
}

/**
 * Thrown when database file or directory does not exist.
 *
 * Recovery: Verify Cursor is installed, check dataPath configuration.
 */
export class DatabaseNotFoundError extends Error {
  name = 'DatabaseNotFoundError' as const;

  /** Path that was not found */
  path: string;

  constructor(path: string) {
    super(`Database not found: ${path}. Check dataPath configuration.`);
    this.path = path;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseNotFoundError);
    }
  }
}

/**
 * Thrown when configuration parameters are invalid.
 *
 * Recovery: Fix configuration values per LibraryConfig validation rules.
 */
export class InvalidConfigError extends Error {
  name = 'InvalidConfigError' as const;

  /** Name of invalid config field */
  field: string;

  /** Invalid value provided */
  value: unknown;

  constructor(field: string, value: unknown, reason: string) {
    super(`Invalid config.${field}: ${reason} (got: ${JSON.stringify(value)})`);
    this.field = field;
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidConfigError);
    }
  }
}

/**
 * Type guard to check if an error is a DatabaseLockedError.
 */
export function isDatabaseLockedError(error: unknown): error is DatabaseLockedError {
  return error instanceof DatabaseLockedError;
}

/**
 * Type guard to check if an error is a DatabaseNotFoundError.
 */
export function isDatabaseNotFoundError(error: unknown): error is DatabaseNotFoundError {
  return error instanceof DatabaseNotFoundError;
}

/**
 * Type guard to check if an error is an InvalidConfigError.
 */
export function isInvalidConfigError(error: unknown): error is InvalidConfigError {
  return error instanceof InvalidConfigError;
}

// ============================================================================
// Migration Errors
// ============================================================================

/**
 * Thrown when a session ID or index cannot be resolved.
 *
 * Recovery: Check session exists with `listSessions()`, use valid ID or index.
 */
export class SessionNotFoundError extends Error {
  name = 'SessionNotFoundError' as const;

  /** The identifier that was not found (index or UUID) */
  identifier: string | number;

  constructor(identifier: string | number) {
    super(`Session not found: ${identifier}. Use 'cursor-history list' to see available sessions.`);
    this.identifier = identifier;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SessionNotFoundError);
    }
  }
}

/**
 * Thrown when destination workspace path has no workspace directory.
 *
 * Recovery: Open the project in Cursor first to create the workspace directory.
 */
export class WorkspaceNotFoundError extends Error {
  name = 'WorkspaceNotFoundError' as const;

  /** The workspace path that was not found */
  path: string;

  constructor(path: string) {
    super(`No workspace found for path: ${path}. Please open the project in Cursor first.`);
    this.path = path;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkspaceNotFoundError);
    }
  }
}

/**
 * Thrown when source and destination paths are the same.
 *
 * Recovery: Specify different source and destination paths.
 */
export class SameWorkspaceError extends Error {
  name = 'SameWorkspaceError' as const;

  /** The path that was specified for both source and destination */
  path: string;

  constructor(path: string) {
    super(`Source and destination are the same: ${path}`);
    this.path = path;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SameWorkspaceError);
    }
  }
}

/**
 * Thrown when no sessions are found for the specified source workspace.
 *
 * Recovery: Check the source path is correct, verify sessions exist with `list --workspace`.
 */
export class NoSessionsFoundError extends Error {
  name = 'NoSessionsFoundError' as const;

  /** The source workspace path */
  path: string;

  constructor(path: string) {
    super(`No sessions found for workspace: ${path}. Use 'cursor-history list --workspace "${path}"' to verify.`);
    this.path = path;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NoSessionsFoundError);
    }
  }
}

/**
 * Thrown when destination has existing sessions and --force not specified.
 *
 * Recovery: Use --force flag to proceed with additive merge.
 */
export class DestinationHasSessionsError extends Error {
  name = 'DestinationHasSessionsError' as const;

  /** The destination workspace path */
  path: string;

  /** Number of existing sessions at destination */
  sessionCount: number;

  constructor(path: string, sessionCount: number) {
    super(
      `Destination already has ${sessionCount} session(s): ${path}. ` +
        `Use --force to proceed (will add sessions alongside existing ones).`
    );
    this.path = path;
    this.sessionCount = sessionCount;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DestinationHasSessionsError);
    }
  }
}

/**
 * Type guard to check if an error is a SessionNotFoundError.
 */
export function isSessionNotFoundError(error: unknown): error is SessionNotFoundError {
  return error instanceof SessionNotFoundError;
}

/**
 * Type guard to check if an error is a WorkspaceNotFoundError.
 */
export function isWorkspaceNotFoundError(error: unknown): error is WorkspaceNotFoundError {
  return error instanceof WorkspaceNotFoundError;
}

/**
 * Type guard to check if an error is a SameWorkspaceError.
 */
export function isSameWorkspaceError(error: unknown): error is SameWorkspaceError {
  return error instanceof SameWorkspaceError;
}

/**
 * Type guard to check if an error is a NoSessionsFoundError.
 */
export function isNoSessionsFoundError(error: unknown): error is NoSessionsFoundError {
  return error instanceof NoSessionsFoundError;
}

/**
 * Type guard to check if an error is a DestinationHasSessionsError.
 */
export function isDestinationHasSessionsError(error: unknown): error is DestinationHasSessionsError {
  return error instanceof DestinationHasSessionsError;
}
