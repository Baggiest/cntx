# Research: Migrate Workspace History

**Feature**: 003-migrate-workspace
**Date**: 2025-12-24
**Updated**: 2025-12-24 (revised for session-level architecture)

## Research Questions

### 1. How are sessions stored and associated with workspaces?

**Decision**: The authoritative workspace association is determined by WHICH workspace's `state.vscdb` contains the session.

**Findings**:

#### Key Insight: Workspace Association
The workspace path is NOT stored in the session data itself. Instead:
- Each workspace directory has its own `state.vscdb` containing sessions
- The `workspace.json` file maps the directory to a project folder path
- When listing sessions, the code assigns `workspacePath` from the workspace's `workspace.json`, not from session fields

```
workspaceStorage/
├── abc123/                    # Workspace dir (hash of path)
│   ├── workspace.json         # {"folder": "file:///project-a"}
│   └── state.vscdb            # Sessions here belong to project-a
├── def456/
│   ├── workspace.json         # {"folder": "file:///project-b"}
│   └── state.vscdb            # Sessions here belong to project-b
```

#### Workspace Storage (`workspaceStorage/<hash>/state.vscdb`)
- Sessions stored in `ItemTable` under key `composer.composerData`
- Value is a **JSON array** of session objects (not individual rows per session)
- The workspace association is implicit: if session is in this file, it belongs to this workspace

#### Global Storage (`globalStorage/state.vscdb`)
- Full conversation data in `cursorDiskKV` table
- Keys: `composerData:<sessionId>` (metadata), `bubbleId:<sessionId>:<bubbleId>` (messages)
- Contains `workspaceUri` field - this is optional display metadata, NOT the authoritative source

**Session Migration Approach**:
1. **Move**: Remove session from source workspace's JSON array, add to destination's JSON array
2. **Copy**: Add session (with new ID) to destination's JSON array, keep original
3. **Optional**: Update `workspaceUri` in global storage for consistency (not required for migration to work)

### 2. How to migrate a single session by ID?

**Decision**: Modify workspace storage JSON arrays (primary), optionally update global metadata.

**Implementation Steps**:

```typescript
function migrateSession(options: MigrateSessionOptions): MigrationResult {
  // 1. Resolve session ID from index if needed
  const sessionId = resolveSessionId(options.sessionIdOrIndex);

  // 2. Find source workspace containing this session
  const sourceWorkspace = findWorkspaceForSession(sessionId);
  if (!sourceWorkspace) throw new SessionNotFoundError(sessionId);

  // 3. Find destination workspace by path
  const destWorkspace = findWorkspaceByPath(options.destination);
  if (!destWorkspace) throw new WorkspaceNotFoundError(options.destination);

  // 4. Read source workspace's composer.composerData JSON array
  const sourceDb = openDatabaseReadWrite(sourceWorkspace.dbPath);
  const sourceData = getComposerData(sourceDb); // JSON array of sessions

  // 5. Find and extract the session object from source array
  const sessionIndex = sourceData.findIndex(s => s.composerId === sessionId);
  const sessionObj = sourceData[sessionIndex];

  // 6. Remove from source (for move) or keep (for copy)
  if (options.mode === 'move') {
    sourceData.splice(sessionIndex, 1);
    updateComposerData(sourceDb, sourceData);
  }
  sourceDb.close();

  // 7. Add to destination workspace's composer.composerData
  const destDb = openDatabaseReadWrite(destWorkspace.dbPath);
  const destData = getComposerData(destDb);
  destData.push(sessionObj); // or copy with new ID for copy mode
  updateComposerData(destDb, destData);
  destDb.close();

  // 8. (Optional) Update workspaceUri in global storage for consistency
  updateGlobalWorkspaceUri(sessionId, options.destination);

  return { success: true, sessionId, ... };
}
```

**Key insight**: The migration is essentially:
1. Parse JSON array from source DB
2. Remove session object from array (move) or keep it (copy)
3. Parse JSON array from destination DB
4. Add session object to that array
5. Write both arrays back

### 3. How to find or create a workspace for a destination path?

**Decision**: Check existing workspaces first, create new if needed.

**Findings**:

The workspace hash directory name is derived from the folder path. Cursor uses a specific hashing algorithm.

**For existing workspaces**:
```typescript
function findWorkspaceByPath(folderPath: string): Workspace | null {
  const workspaces = findWorkspaces();
  return workspaces.find(w => w.path === folderPath) ?? null;
}
```

**For new workspaces** (destination path has no existing workspace):
1. Cannot easily create new workspace hash (Cursor's algorithm is internal)
2. Alternative: Reuse an existing empty workspace or wait for Cursor to create it
3. **Simplest approach**: Require destination workspace to exist (user must have opened the project in Cursor at least once)

**Recommendation**: For MVP, require destination workspace to already exist. Document this limitation. Future enhancement could handle workspace creation.

### 4. What database operations are needed?

**Decision**: Read-write access to both global and workspace SQLite databases.

**Operations needed**:

#### Global Storage (`globalStorage/state.vscdb`)
```sql
-- Update session metadata with new workspaceUri
UPDATE cursorDiskKV
SET value = json_set(value, '$.workspaceUri', 'file:///new/path')
WHERE key = 'composerData:<sessionId>';
```

#### Workspace Storage - Source (`workspaceStorage/<srcHash>/state.vscdb`)
```sql
-- For MOVE: Remove session from source
-- Need to parse JSON, remove session, rewrite
UPDATE ItemTable
SET value = <updated_json_without_session>
WHERE key = 'composer.composerData';
```

#### Workspace Storage - Destination (`workspaceStorage/<destHash>/state.vscdb`)
```sql
-- Add session to destination
-- Need to parse JSON, add session, rewrite
UPDATE ItemTable
SET value = <updated_json_with_session>
WHERE key = 'composer.composerData';
```

**Note**: Session data is stored as JSON arrays, so updates require parse → modify → serialize → write.

### 5. How to handle copy mode?

**Decision**: For copy, duplicate the session with a new unique ID.

**Implementation**:
1. Generate new UUID for the copied session
2. Copy all bubble data in global storage with new keys: `bubbleId:<newId>:<bubbleId>`
3. Copy composerData with new ID to global storage
4. Add session to destination workspace's `composer.composerData` JSON

**Complexity note**: Copy is more complex than move because:
- Must generate new unique session ID
- Must duplicate all bubble entries (could be many per session)
- Must update internal references within the copied data

**Recommendation**: Implement move first (P1), copy as P2.

### 6. Validation and error handling

**Decision**: Fail fast with clear error messages.

**Validations**:
1. Session ID/index must resolve to existing session
2. Destination path must have an existing workspace (for MVP)
3. Database must not be locked (SQLITE_BUSY check)
4. Source and destination must differ

**Error types**:
- `SessionNotFoundError` - session ID/index doesn't exist
- `WorkspaceNotFoundError` - destination path has no workspace
- `DatabaseLockedError` - Cursor is running
- `MigrationError` - generic migration failure with details

### 7. How does migrateWorkspace use migrateSession?

**Decision**: Simple loop with result aggregation.

**Implementation**:
```typescript
function migrateWorkspace(options: MigrateWorkspaceOptions): MigrationResult[] {
  // 1. Find all sessions in source workspace
  const sessions = listSessions({ workspacePath: options.source });

  if (sessions.length === 0) {
    throw new NoSessionsFoundError(options.source);
  }

  // 2. Migrate each session
  const results: MigrationResult[] = [];
  for (const session of sessions) {
    try {
      const result = migrateSession({
        sessionId: session.id,
        destination: options.destination,
        mode: options.mode,
        dryRun: options.dryRun,
        force: options.force,
      });
      results.push(result);
    } catch (err) {
      results.push({ success: false, sessionId: session.id, error: err });
      // Continue with remaining sessions (no rollback)
    }
  }

  return results;
}
```

## Summary

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Core primitive | `migrateSession()` | Single session migration, all other operations build on this |
| Storage updates | Global + workspace DBs | Both need updates for complete migration |
| Workspace creation | Require existing | Cursor's hash algorithm is internal; user must open project first |
| Move operation | Update references, move data | Simple, no duplication needed |
| Copy operation | Duplicate with new IDs | More complex, defer to P2 |
| Error handling | Continue on partial failure | Report per-session results, don't rollback successes |
| migrateWorkspace | Loop over migrateSession | Reduces redundancy, consistent behavior |

## Implementation Notes

1. **Read-write DB access**: Add `openDatabaseReadWrite()` function
2. **JSON manipulation**: Parse, modify, serialize session arrays in ItemTable
3. **Transaction safety**: Use SQLite transactions for atomic updates per session
4. **Index resolution**: Reuse existing `listSessions()` to map index → session ID
5. **Path normalization**: Consistent handling of paths before comparison/storage

## Open Questions Resolved

1. ~~Should we support wildcard/glob source paths?~~ No, exact match per clarification
2. ~~Should we backup before modifying?~~ Yes, create `.bak` files (implementation detail)
3. ~~What if destination has sessions?~~ Handled by `--force` (additive merge)
