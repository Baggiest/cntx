# Data Model: Migrate Workspace History

**Feature**: 003-migrate-workspace
**Date**: 2025-12-24
**Updated**: 2025-12-24 (revised for session-level architecture)

## Entities

### SessionIdentifier

Represents how a session can be identified for migration.

| Field | Type | Description |
|-------|------|-------------|
| `value` | `string \| number` | Either a session UUID (string) or 1-based index (number) |
| `type` | `'id' \| 'index'` | Resolved type of identifier |

**Resolution rules**:
- If numeric and within valid index range → treat as index
- Otherwise → treat as UUID
- Comma-separated values allowed: `1,3,5` or `abc123,def456`

---

### MigrateSessionOptions

Configuration options for single/multiple session migration (core primitive).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `sessions` | `string \| string[]` | Yes | - | Session ID(s) or index(es) to migrate |
| `destination` | `string` | Yes | - | Destination workspace path |
| `mode` | `'move' \| 'copy'` | No | `'move'` | Migration mode |
| `dryRun` | `boolean` | No | `false` | Preview changes without applying |
| `force` | `boolean` | No | `false` | Proceed even if destination has existing history |

**Validation Rules**:
- Each session identifier must resolve to an existing session
- `destination` must be a valid path (resolved to absolute)
- For `mode: 'copy'`, new session IDs are generated

---

### MigrateWorkspaceOptions

Configuration options for workspace-level migration (wrapper over session migration).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `source` | `string` | Yes | - | Source workspace path to migrate from |
| `destination` | `string` | Yes | - | Destination workspace path to migrate to |
| `mode` | `'move' \| 'copy'` | No | `'move'` | Migration mode |
| `dryRun` | `boolean` | No | `false` | Preview changes without applying |
| `force` | `boolean` | No | `false` | Proceed even if destination has existing history |

**Validation Rules**:
- `source` must match at least one session's workspace path (exact match)
- `source` and `destination` must differ (after path normalization)

---

### SessionMigrationResult

Outcome of a single session migration.

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether the migration completed successfully |
| `sessionId` | `string` | UUID of the migrated session |
| `sourceWorkspace` | `string` | Original workspace path |
| `destinationWorkspace` | `string` | New workspace path |
| `mode` | `'move' \| 'copy'` | The mode used |
| `newSessionId` | `string?` | For copy mode: the ID of the new session |
| `error` | `MigrationError?` | Error details if `success` is false |
| `dryRun` | `boolean` | Whether this was a dry run |

---

### WorkspaceMigrationResult

Aggregate outcome of workspace-level migration.

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | True if all sessions migrated successfully |
| `source` | `string` | Normalized source path |
| `destination` | `string` | Normalized destination path |
| `mode` | `'move' \| 'copy'` | The mode used |
| `totalSessions` | `number` | Total sessions attempted |
| `successCount` | `number` | Number of successful migrations |
| `failureCount` | `number` | Number of failed migrations |
| `results` | `SessionMigrationResult[]` | Per-session results |
| `dryRun` | `boolean` | Whether this was a dry run |

---

### MigrationError

Error details for a failed migration.

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string` | Error code (e.g., `SESSION_NOT_FOUND`, `WORKSPACE_NOT_FOUND`, `SQLITE_BUSY`) |
| `message` | `string` | Human-readable error description |
| `sessionId` | `string?` | The session that failed (if applicable) |
| `details` | `Record<string, unknown>?` | Additional error context |

**Error Codes**:
- `SESSION_NOT_FOUND` - Session ID/index doesn't exist
- `WORKSPACE_NOT_FOUND` - Destination path has no workspace directory
- `SAME_WORKSPACE` - Source and destination are the same
- `DATABASE_LOCKED` - Cursor is running
- `PERMISSION_DENIED` - Cannot write to database files
- `MIGRATION_FAILED` - Generic failure with details

---

## State Transitions

### Session Migration Flow

```
┌─────────────┐
│   IDLE      │
└──────┬──────┘
       │ migrateSession()
       ▼
┌─────────────┐     session not found
│  RESOLVING  │─────────────────────────► ERROR (SESSION_NOT_FOUND)
│  (ID/index) │
└──────┬──────┘
       │ session found
       ▼
┌─────────────┐     workspace not found
│  VALIDATING │─────────────────────────► ERROR (WORKSPACE_NOT_FOUND)
│  (dest path)│
└──────┬──────┘
       │ validation passes
       ▼
┌─────────────┐     dryRun=true
│  PLANNING   │─────────────────────────► COMPLETE (dryRun result)
└──────┬──────┘
       │ dryRun=false
       ▼
┌─────────────┐
│  UPDATING   │     write fails
│  (global DB)│─────────────────────────► ERROR (MIGRATION_FAILED)
└──────┬──────┘
       │ global update success
       ▼
┌─────────────┐
│  UPDATING   │     write fails
│ (workspace) │─────────────────────────► PARTIAL_FAILURE
└──────┬──────┘
       │ all writes succeed
       ▼
┌─────────────┐
│  COMPLETE   │
└─────────────┘
```

### Workspace Migration Flow

```
┌─────────────┐
│   IDLE      │
└──────┬──────┘
       │ migrateWorkspace()
       ▼
┌─────────────┐     no sessions found
│  LISTING    │─────────────────────────► ERROR (NO_SESSIONS_FOUND)
│  (sessions) │
└──────┬──────┘
       │ sessions found (n)
       ▼
┌─────────────┐
│  ITERATING  │◄────────────────────┐
│  (1 to n)   │                     │
└──────┬──────┘                     │
       │ migrateSession()           │
       ▼                            │
┌─────────────┐                     │
│  RECORDING  │─────────────────────┘
│  (result)   │     more sessions
└──────┬──────┘
       │ no more sessions
       ▼
┌─────────────┐
│  COMPLETE   │ (aggregate results)
└─────────────┘
```

---

## Storage Schema

### Key Insight: Workspace Association

The workspace path is **NOT stored in the session data**. Instead, sessions are associated with workspaces by virtue of being stored in that workspace's `state.vscdb` file:

```
workspaceStorage/
├── abc123/                    # Workspace directory (hash of path)
│   ├── workspace.json         # {"folder": "file:///project-a"} ← defines the path
│   └── state.vscdb            # Sessions here belong to project-a
│       └── ItemTable
│           └── composer.composerData: [session1, session2, ...]  ← JSON array
```

**Migration = moving session objects between JSON arrays in different workspace DBs**

### Workspace Storage (`workspaceStorage/<hash>/state.vscdb`)

**Table**: `ItemTable`

| Key | Value Type | Description |
|-----|------------|-------------|
| `composer.composerData` | JSON array | Array of session objects for this workspace |

**Migration operations**:
- **Move**: Remove session from source array, add to destination array
- **Copy**: Add session (with new ID) to destination array, keep in source

**Session object structure** (within the array):
```json
{
  "composerId": "abc123-def456",
  "name": "Session title",
  "createdAt": 1735034400000,
  "richText": [...],
  "bubbles": [...],
  ...
}
```

### Global Storage (`globalStorage/state.vscdb`)

**Table**: `cursorDiskKV`

| Key Pattern | Value | Migration Update |
|-------------|-------|------------------|
| `composerData:<sessionId>` | JSON with session metadata | Optional: update `workspaceUri` field |
| `bubbleId:<sessionId>:<bubbleId>` | JSON with message data | No change needed (move), Copy for copy mode |

**Note**: The `workspaceUri` in global storage is **display metadata only**. The authoritative workspace association is which `state.vscdb` contains the session. Updating `workspaceUri` is optional but recommended for consistency.

---

## Relationships

```
┌───────────────────────────────────────────────────────────────────┐
│                     Migration Operation                           │
│                                                                   │
│  migrateSession(sessionId, destination)                          │
│        │                                                          │
│        │  1. Find source workspace containing session             │
│        ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Source Workspace DB (state.vscdb)                           │ │
│  │ ItemTable.composer.composerData = [s1, s2, SESSION, s4]     │ │
│  │                                                              │ │
│  │ → Parse JSON array                                           │ │
│  │ → Find SESSION by composerId                                 │ │
│  │ → Remove from array (for move)                               │ │
│  │ → Write updated array back                                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│        │                                                          │
│        │  2. Add to destination workspace                         │
│        ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Dest Workspace DB (state.vscdb)                             │ │
│  │ ItemTable.composer.composerData = [x1, x2]                  │ │
│  │                                                              │ │
│  │ → Parse JSON array                                           │ │
│  │ → Append SESSION to array                                    │ │
│  │ → Write updated array back                                   │ │
│  │                                                              │ │
│  │ Result: [x1, x2, SESSION]                                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│        │                                                          │
│        │  3. (Optional) Update global metadata                    │
│        ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Global Storage (globalStorage/state.vscdb)                  │ │
│  │ cursorDiskKV.composerData:<sessionId>.workspaceUri          │ │
│  │                                                              │ │
│  │ → Update workspaceUri to destination path                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  migrateWorkspace(source, destination)                           │
│        │                                                          │
│        └─────────► for each session in source:                   │
│                      migrateSession(session.id, destination)     │
└───────────────────────────────────────────────────────────────────┘
```

---

## Index Resolution

| Input | Type | Resolution |
|-------|------|------------|
| `1` | number | Index 1 → lookup in `listSessions()` → session ID |
| `3,5,7` | string | Parse as comma-separated indices → resolve each |
| `abc123-def456` | string | Direct session UUID |
| `abc123,def456` | string | Parse as comma-separated UUIDs |

**Resolution function**:
```typescript
function resolveSessionIdentifiers(input: string): string[] {
  const parts = input.split(',').map(s => s.trim());
  return parts.map(part => {
    if (/^\d+$/.test(part)) {
      // Numeric: treat as index
      const sessions = listSessions({ all: true });
      const session = sessions.find(s => s.index === parseInt(part));
      if (!session) throw new SessionNotFoundError(part);
      return session.id;
    }
    // Non-numeric: treat as UUID
    return part;
  });
}
```
