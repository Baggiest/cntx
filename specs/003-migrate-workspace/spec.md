# Feature Specification: Migrate Workspace History

**Feature Branch**: `003-migrate-workspace`
**Created**: 2025-12-24
**Status**: Draft
**Input**: User description: "CLI command and library API to move/copy chat history from one workspace directory to another, enabling history migration after project renames. Two modes: copy (like cp) and move (like mv). Support fine-grained session-level migration."

## Clarifications

### Session 2025-12-24

- Q: How should the system match the source workspace path to sessions in the database? → A: Exact match only - only migrate sessions where stored path exactly equals the source path.
- Q: When `--force` is used and destination already has history, what happens to existing sessions? → A: Additive merge - keep existing destination sessions, add migrated sessions alongside them.
- Q: How should session-level migration work with the CLI interface? → A: Separate command - `migrate-session` for individual sessions, `migrate` for workspace-level (which uses migrate-session internally).

## Architecture Overview

The migration feature has a **layered design**:

1. **Core primitive**: `migrate-session` - moves/copies a single session by ID to a destination path
2. **Convenience wrapper**: `migrate` - migrates all sessions from a source path to destination (calls migrate-session for each)

This design reduces redundancy and allows fine-grained control when needed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Migrate Single Session to New Project (Priority: P1)

A developer wants to move a specific chat conversation from one project to another. For example, they started a conversation in project A but realized it belongs in project B.

**Why this priority**: Fine-grained session migration is the core primitive. All other operations build on this.

**Independent Test**: Can be fully tested by running `cursor-history migrate-session <session-id> /dest/path` and verifying the session appears under the new workspace.

**Acceptance Scenarios**:

1. **Given** a session with ID `abc123` associated with `/home/user/project-a`, **When** user runs `cursor-history migrate-session abc123 /home/user/project-b`, **Then** the session is now associated with `/home/user/project-b` and no longer appears under `/home/user/project-a`.

2. **Given** a session ID that doesn't exist, **When** user runs `migrate-session`, **Then** the system displays an error message indicating session not found.

3. **Given** a session index (e.g., `3`) instead of ID, **When** user runs `cursor-history migrate-session 3 /dest/path`, **Then** the system resolves the index to the session ID and migrates it.

---

### User Story 2 - Migrate Multiple Sessions by ID (Priority: P1)

A developer wants to move several specific sessions at once without migrating the entire workspace.

**Why this priority**: Common use case when reorganizing history across projects.

**Independent Test**: Can be fully tested by running `cursor-history migrate-session 1,3,5 /dest/path` and verifying all specified sessions move.

**Acceptance Scenarios**:

1. **Given** sessions with indices 1, 3, and 5, **When** user runs `cursor-history migrate-session 1,3,5 /home/user/new-project`, **Then** all three sessions are migrated to the new path.

2. **Given** a list containing a non-existent session ID, **When** user runs migrate-session, **Then** the system reports which sessions succeeded and which failed, without rolling back successful migrations.

---

### User Story 3 - Move All History to Renamed Project (Priority: P1)

A developer has renamed their project directory and wants to move all chat history to the new path.

**Why this priority**: Most common bulk operation - project renames happen frequently.

**Independent Test**: Can be fully tested by running `cursor-history migrate /old/path /new/path` and verifying all history moves.

**Acceptance Scenarios**:

1. **Given** a workspace with 10 chat sessions at `/home/user/old-project`, **When** user runs `cursor-history migrate /home/user/old-project /home/user/new-project`, **Then** all 10 sessions are now associated with the new path (internally calls migrate-session for each).

2. **Given** a source path with no chat history, **When** user runs the migrate command, **Then** the system displays an error message indicating no sessions found for the source path.

3. **Given** a successful move operation, **When** user runs `cursor-history list --workspace /home/user/new-project`, **Then** all migrated sessions appear in the list.

---

### User Story 4 - Copy Sessions to New Location (Priority: P2)

A developer wants to duplicate specific sessions or all sessions to a new workspace path while keeping the originals intact.

**Why this priority**: Copy operation is less common than move but useful for forking projects or creating backups.

**Independent Test**: Can be fully tested by running `cursor-history migrate-session --copy <id> /dest/path` or `cursor-history migrate --copy /src /dest`.

**Acceptance Scenarios**:

1. **Given** a session with ID `abc123`, **When** user runs `cursor-history migrate-session --copy abc123 /home/user/project-b`, **Then** the session exists at both the original location and the new path.

2. **Given** `cursor-history migrate --copy /src /dest`, **When** operation completes, **Then** sessions exist at both source and destination paths.

---

### User Story 5 - Programmatic Migration via Library API (Priority: P2)

A developer building tooling around Cursor wants to programmatically migrate sessions as part of their automation workflow.

**Why this priority**: Library API enables integration with other tools and automation scripts.

**Independent Test**: Can be fully tested by calling `migrateSession()` and `migrateWorkspace()` functions.

**Acceptance Scenarios**:

1. **Given** the library is imported, **When** developer calls `migrateSession({ sessionId: 'abc123', destination: '/new/path', mode: 'move' })`, **Then** the function returns a result object with migration status.

2. **Given** the library is imported, **When** developer calls `migrateWorkspace({ source: '/old/path', destination: '/new/path', mode: 'move' })`, **Then** the function internally calls migrateSession for each matching session and returns aggregate results.

3. **Given** an invalid session ID, **When** developer calls migrateSession, **Then** the function throws a `SessionNotFoundError`.

---

### User Story 6 - Dry Run Preview (Priority: P3)

A user wants to preview what will be migrated before actually performing the operation.

**Why this priority**: Safety feature that helps users avoid mistakes.

**Independent Test**: Can be fully tested by adding `--dry-run` flag to any migrate command.

**Acceptance Scenarios**:

1. **Given** any migrate command with `--dry-run`, **When** executed, **Then** output shows what would happen without making any changes.

2. **Given** `cursor-history migrate --dry-run /old/path /new/path`, **When** output is displayed, **Then** it lists each session that would be migrated with its ID and title.

---

### Edge Cases

- What happens when the destination path already has existing chat history? System should warn and require `--force` flag to proceed; with `--force`, performs additive merge.
- What happens when source and destination paths are the same? System should display an error indicating paths must be different.
- What happens when a session ID is provided both as index and UUID format? System should try index first (if numeric), then UUID.
- What happens during a partial failure in bulk migration? System should report which sessions succeeded/failed and continue with remaining sessions.
- What happens if the database is locked by Cursor? System should display the existing "database locked" error with guidance to close Cursor.
- What happens when migrating to a workspace that doesn't have a workspace directory yet? System should create the necessary workspace directory structure.

## Requirements *(mandatory)*

### Functional Requirements

#### Core (Session-Level)
- **FR-001**: System MUST support `migrate-session` command that moves/copies individual sessions by ID or index.
- **FR-002**: System MUST accept multiple session identifiers (comma-separated) in a single migrate-session call.
- **FR-003**: System MUST resolve session index to session ID before migration.
- **FR-004**: System MUST support two modes for session migration: `move` (default) and `copy`.

#### Workspace-Level (Built on Core)
- **FR-005**: System MUST support `migrate` command that migrates all sessions from source path to destination.
- **FR-006**: `migrate` command MUST internally use session-level migration for each matching session.
- **FR-007**: System MUST use exact path matching when identifying sessions to migrate (no prefix or fuzzy matching).

#### Common
- **FR-008**: System MUST provide a dry-run option (`--dry-run`) for both commands.
- **FR-009**: System MUST report results: sessions affected, success/failure status per session.
- **FR-010**: System MUST require `--force` flag when destination already has history; when forced, perform additive merge.
- **FR-011**: System MUST support both absolute and relative paths (relative paths resolved to absolute).
- **FR-012**: System MUST preserve all session data during migration (messages, timestamps, metadata).

#### Library API
- **FR-013**: Library MUST expose `migrateSession(options)` function as the core primitive.
- **FR-014**: Library MUST expose `migrateWorkspace(options)` function that uses migrateSession internally.
- **FR-015**: Library functions MUST return typed result objects with migration details.

### Key Entities

- **Session ID**: Unique identifier for a chat session (UUID format like `abc123-def456`).
- **Session Index**: 1-based position in the session list (as shown by `cursor-history list`).
- **Workspace Path**: The directory path associated with a chat session.
- **Migration Result**: Outcome including session ID, source/destination paths, mode, success status, and any errors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can migrate a single session by ID or index in one command.
- **SC-002**: Users can migrate multiple sessions by providing comma-separated IDs/indices.
- **SC-003**: Users can migrate all sessions from a workspace in one command.
- **SC-004**: `migrate` command produces identical results to running `migrate-session` for each session individually.
- **SC-005**: Migrated sessions appear correctly in Cursor's chat history view under the new workspace path.
- **SC-006**: Move operations remove the session from the original workspace.
- **SC-007**: Copy operations preserve the session at the original workspace.
- **SC-008**: Dry-run operations make zero modifications to the database.
- **SC-009**: Library API provides equivalent functionality to CLI with programmatic error handling.
- **SC-010**: Migration of 100 sessions completes within 10 seconds.

## Assumptions

- Session IDs are globally unique across all workspaces.
- The existing `list` command provides session indices that can be used with migrate-session.
- Users understand that this tool modifies Cursor's internal database and should close Cursor before running.
- For copy operations, the system can create new session entries with the same content but associated with a different workspace path.
