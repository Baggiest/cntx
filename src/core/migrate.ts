/**
 * Core migration logic for Cursor chat history
 *
 * This module provides session-level migration as the core primitive.
 * Workspace-level migration is built on top of session migration.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';
import {
  findWorkspaceForSession,
  findWorkspaceByPath,
  openDatabaseReadWrite,
  getComposerData,
  updateComposerData,
} from './storage.js';
import { normalizePath, pathsEqual } from '../lib/platform.js';
import {
  SessionNotFoundError,
  WorkspaceNotFoundError,
  SameWorkspaceError,
  NoSessionsFoundError,
  DestinationHasSessionsError,
} from '../lib/errors.js';
import type {
  MigrateSessionOptions,
  MigrateWorkspaceOptions,
  SessionMigrationResult,
  WorkspaceMigrationResult,
} from './types.js';

/**
 * Generate a new unique session ID (UUID v4 format)
 */
function generateSessionId(): string {
  // Simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get the global Cursor storage path
 */
function getGlobalStoragePath(): string {
  const platform = process.platform;
  const home = homedir();

  if (platform === 'win32') {
    return join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage');
  } else if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage');
  } else {
    return join(home, '.config', 'Cursor', 'User', 'globalStorage');
  }
}

/**
 * Copy all bubble data for a session in global storage with new IDs.
 * This is required for copy mode to create independent session data.
 *
 * @param oldComposerId - Original composer ID
 * @param newComposerId - New composer ID for the copy
 * @returns Map of old bubble IDs to new bubble IDs
 */
function copyBubbleDataInGlobalStorage(
  oldComposerId: string,
  newComposerId: string
): Map<string, string> {
  const globalDbPath = join(getGlobalStoragePath(), 'state.vscdb');

  if (!existsSync(globalDbPath)) {
    return new Map();
  }

  const bubbleIdMap = new Map<string, string>();
  const db = new Database(globalDbPath, { readonly: false });

  try {
    // 1. Copy composerData entry with new ID
    const composerDataRow = db.prepare(
      "SELECT value FROM cursorDiskKV WHERE key = ?"
    ).get(`composerData:${oldComposerId}`) as { value: string } | undefined;

    if (composerDataRow) {
      const composerData = JSON.parse(composerDataRow.value);

      // Update composerId in the data
      composerData.composerId = newComposerId;

      // We'll update fullConversationHeadersOnly after generating new bubble IDs
      const oldBubbleHeaders = composerData.fullConversationHeadersOnly || [];

      // Generate new bubble IDs and build the mapping
      const newBubbleHeaders: Array<{ bubbleId: string; type: number; serverBubbleId?: string }> = [];
      for (const header of oldBubbleHeaders) {
        if (header.bubbleId) {
          const newBubbleId = generateSessionId();
          bubbleIdMap.set(header.bubbleId, newBubbleId);
          newBubbleHeaders.push({
            ...header,
            bubbleId: newBubbleId,
          });
        }
      }
      composerData.fullConversationHeadersOnly = newBubbleHeaders;

      // Insert new composerData
      db.prepare(
        "INSERT OR REPLACE INTO cursorDiskKV (key, value) VALUES (?, ?)"
      ).run(`composerData:${newComposerId}`, JSON.stringify(composerData));
    }

    // 2. Copy all bubble entries with new IDs
    const bubbleRows = db.prepare(
      "SELECT key, value FROM cursorDiskKV WHERE key LIKE ?"
    ).all(`bubbleId:${oldComposerId}:%`) as Array<{ key: string; value: string }>;

    for (const row of bubbleRows) {
      // Extract old bubble ID from key: bubbleId:<composerId>:<bubbleId>
      const parts = row.key.split(':');
      const oldBubbleId = parts[2];

      if (!oldBubbleId) continue;

      // Get or generate new bubble ID
      let newBubbleId = bubbleIdMap.get(oldBubbleId);
      if (!newBubbleId) {
        newBubbleId = generateSessionId();
        bubbleIdMap.set(oldBubbleId, newBubbleId);
      }

      // Parse and update the bubble data
      const bubbleData = JSON.parse(row.value);
      bubbleData.bubbleId = newBubbleId;

      // Create new key with new IDs
      const newKey = `bubbleId:${newComposerId}:${newBubbleId}`;

      // Insert the copied bubble
      db.prepare(
        "INSERT OR REPLACE INTO cursorDiskKV (key, value) VALUES (?, ?)"
      ).run(newKey, JSON.stringify(bubbleData));
    }

    return bubbleIdMap;
  } finally {
    db.close();
  }
}

/**
 * Migrate a single session from its current workspace to a destination workspace.
 *
 * This is the core primitive for all migration operations.
 * Move mode: removes session from source, adds to destination.
 * Copy mode: duplicates session to destination, keeps source intact.
 *
 * @param sessionId - The session ID to migrate
 * @param options - Migration options
 * @returns Migration result for this session
 */
export function migrateSession(
  sessionId: string,
  options: Omit<MigrateSessionOptions, 'sessionIds'>
): SessionMigrationResult {
  const { destination, mode, dryRun, dataPath } = options;
  // Note: force option is used at the CLI layer for validation, not in core migration

  // Normalize destination path
  const normalizedDest = normalizePath(destination);

  // Find source workspace for this session
  const sourceInfo = findWorkspaceForSession(sessionId, dataPath);
  if (!sourceInfo) {
    throw new SessionNotFoundError(sessionId);
  }

  const sourceWorkspace = sourceInfo.workspace.path;

  // Check if source and destination are the same
  if (pathsEqual(sourceWorkspace, normalizedDest)) {
    throw new SameWorkspaceError(normalizedDest);
  }

  // Find destination workspace
  const destInfo = findWorkspaceByPath(normalizedDest, dataPath);
  if (!destInfo) {
    throw new WorkspaceNotFoundError(normalizedDest);
  }

  // If dry run, return preview result without making changes
  if (dryRun) {
    return {
      success: true,
      sessionId,
      sourceWorkspace,
      destinationWorkspace: normalizedDest,
      mode,
      dryRun: true,
    };
  }

  // Perform the actual migration
  try {
    // Open both databases for read-write
    const sourceDb = openDatabaseReadWrite(sourceInfo.dbPath);
    const destDb = openDatabaseReadWrite(destInfo.dbPath);

    try {
      // Get composer data from both workspaces
      const sourceResult = getComposerData(sourceDb);
      const destResult = getComposerData(destDb);

      if (!sourceResult) {
        throw new Error('Source workspace has no composer data');
      }

      // Find the session in source data
      const sessionIndex = sourceResult.composers.findIndex((s) => s.composerId === sessionId);
      if (sessionIndex === -1) {
        throw new SessionNotFoundError(sessionId);
      }

      const sessionToMigrate = sourceResult.composers[sessionIndex]!;

      if (mode === 'move') {
        // Remove from source
        const newSourceComposers = sourceResult.composers.filter((_, i) => i !== sessionIndex);
        updateComposerData(sourceDb, newSourceComposers, sourceResult.isNewFormat, sourceResult.rawData);

        // Add to destination
        const destComposers = destResult ? destResult.composers : [];
        const newDestComposers = [...destComposers, sessionToMigrate];
        updateComposerData(
          destDb,
          newDestComposers,
          destResult?.isNewFormat ?? sourceResult.isNewFormat,
          destResult?.rawData
        );

        return {
          success: true,
          sessionId,
          sourceWorkspace,
          destinationWorkspace: normalizedDest,
          mode: 'move',
          dryRun: false,
        };
      } else {
        // Copy mode - duplicate session to destination, keep source intact
        // Generate new session ID for the copy
        const newSessionId = generateSessionId();

        // Copy all bubble data in global storage with new IDs
        // This ensures the copy is fully independent from the original
        copyBubbleDataInGlobalStorage(sessionId, newSessionId);

        // Deep clone and update the session with new ID
        const copiedSession = JSON.parse(JSON.stringify(sessionToMigrate)) as { composerId?: string };
        copiedSession.composerId = newSessionId;

        // Add to destination (don't modify source)
        const destComposers = destResult ? destResult.composers : [];
        const newDestComposers = [...destComposers, copiedSession];
        updateComposerData(
          destDb,
          newDestComposers,
          destResult?.isNewFormat ?? sourceResult.isNewFormat,
          destResult?.rawData
        );

        return {
          success: true,
          sessionId,
          sourceWorkspace,
          destinationWorkspace: normalizedDest,
          mode: 'copy',
          newSessionId,
          dryRun: false,
        };
      }
    } finally {
      sourceDb.close();
      destDb.close();
    }
  } catch (error) {
    // Return failure result instead of throwing for partial failure handling
    return {
      success: false,
      sessionId,
      sourceWorkspace,
      destinationWorkspace: normalizedDest,
      mode,
      error: error instanceof Error ? error.message : String(error),
      dryRun: false,
    };
  }
}

/**
 * Migrate multiple sessions to a destination workspace.
 *
 * Handles batch migration with partial failure support.
 * Each session is migrated independently - failures don't stop the batch.
 *
 * @param options - Migration options including session IDs
 * @returns Array of results for each session
 */
export function migrateSessions(options: MigrateSessionOptions): SessionMigrationResult[] {
  const { sessionIds, ...sessionOptions } = options;
  const results: SessionMigrationResult[] = [];

  for (const sessionId of sessionIds) {
    try {
      const result = migrateSession(sessionId, sessionOptions);
      results.push(result);
    } catch (error) {
      // Convert thrown errors to result objects for partial failure handling
      results.push({
        success: false,
        sessionId,
        sourceWorkspace: 'unknown',
        destinationWorkspace: options.destination,
        mode: options.mode,
        error: error instanceof Error ? error.message : String(error),
        dryRun: options.dryRun,
      });
    }
  }

  return results;
}

/**
 * Migrate all sessions from one workspace to another.
 *
 * This is a convenience wrapper that finds all sessions in the source workspace
 * and calls migrateSession for each one.
 *
 * @param options - Workspace migration options
 * @returns Aggregate result with per-session details
 */
export function migrateWorkspace(options: MigrateWorkspaceOptions): WorkspaceMigrationResult {
  const { source, destination, mode, dryRun, force, dataPath } = options;

  // Normalize paths
  const normalizedSource = normalizePath(source);
  const normalizedDest = normalizePath(destination);

  // Check if source and destination are the same
  if (pathsEqual(normalizedSource, normalizedDest)) {
    throw new SameWorkspaceError(normalizedSource);
  }

  // Find source workspace
  const sourceInfo = findWorkspaceByPath(normalizedSource, dataPath);
  if (!sourceInfo) {
    throw new WorkspaceNotFoundError(normalizedSource);
  }

  // Find destination workspace
  const destInfo = findWorkspaceByPath(normalizedDest, dataPath);
  if (!destInfo) {
    throw new WorkspaceNotFoundError(normalizedDest);
  }

  // Get sessions from source workspace
  const sourceDb = openDatabaseReadWrite(sourceInfo.dbPath);
  const sourceResult = getComposerData(sourceDb);
  sourceDb.close();

  if (!sourceResult || sourceResult.composers.length === 0) {
    throw new NoSessionsFoundError(normalizedSource);
  }

  // Check if destination has existing sessions (unless force is set)
  if (!force) {
    const destDb = openDatabaseReadWrite(destInfo.dbPath);
    const destResult = getComposerData(destDb);
    destDb.close();

    if (destResult && destResult.composers.length > 0) {
      throw new DestinationHasSessionsError(normalizedDest, destResult.composers.length);
    }
  }

  // Extract session IDs
  const sessionIds = sourceResult.composers
    .map((s) => s.composerId)
    .filter((id): id is string => typeof id === 'string');

  if (sessionIds.length === 0) {
    throw new NoSessionsFoundError(normalizedSource);
  }

  // Migrate all sessions
  const results = migrateSessions({
    sessionIds,
    destination: normalizedDest,
    mode,
    dryRun,
    force,
    dataPath,
  });

  // Aggregate results
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  return {
    success: failureCount === 0,
    source: normalizedSource,
    destination: normalizedDest,
    mode,
    totalSessions: results.length,
    successCount,
    failureCount,
    results,
    dryRun,
  };
}
