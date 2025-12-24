# Tasks: Migrate Workspace History

**Input**: Design documents from `/specs/003-migrate-workspace/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.ts

**Tests**: Not explicitly requested in spec. Test tasks omitted.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, etc.)
- Paths are relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and type definitions

- [x] T001 Add migration types to src/core/types.ts (MigrateSessionOptions, SessionMigrationResult, MigrationMode)
- [x] T002 [P] Add migration error classes to src/lib/errors.ts (SessionNotFoundError, WorkspaceNotFoundError, SameWorkspaceError)
- [x] T003 [P] Add migration types to src/lib/types.ts (MigrateSessionConfig, MigrationResult for library API)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add openDatabaseReadWrite() function to src/core/storage.ts (readonly: false option)
- [x] T005 Add findWorkspaceForSession(sessionId) function to src/core/storage.ts
- [x] T006 Add findWorkspaceByPath(path) function to src/core/storage.ts
- [x] T007 Add getComposerData(db) function to src/core/storage.ts (read JSON array from ItemTable)
- [x] T008 Add updateComposerData(db, data) function to src/core/storage.ts (write JSON array to ItemTable)
- [x] T009 Add resolveSessionIdentifiers(input) function to src/core/storage.ts (index/ID resolution)
- [x] T010 Add path normalization utilities to src/lib/platform.ts (normalizePath, pathsEqual)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Migrate Single Session (Priority: P1) 🎯 MVP

**Goal**: Move a single session by ID or index to a new workspace path

**Independent Test**: `cursor-history migrate-session <session-id> /dest/path` moves one session

### Implementation for User Story 1

- [x] T011 [US1] Create core migrateSession() function in src/core/migrate.ts (move mode only)
- [x] T012 [US1] Implement session extraction from source workspace JSON array in src/core/migrate.ts
- [x] T013 [US1] Implement session insertion into destination workspace JSON array in src/core/migrate.ts
- [x] T014 [US1] N/A - workspaceUri in global storage is informational only; bubble data referenced by composerId
- [x] T015 [US1] Create migrate-session CLI command in src/cli/commands/migrate-session.ts
- [x] T016 [US1] Register migrate-session command in src/cli/index.ts
- [x] T017 [US1] Add validation: session exists, destination workspace exists, paths differ in src/core/migrate.ts
- [x] T018 [US1] Add error handling and user-friendly messages in src/cli/commands/migrate-session.ts

**Checkpoint**: Single session migration (move mode) works via CLI

---

## Phase 4: User Story 2 - Migrate Multiple Sessions (Priority: P1)

**Goal**: Move multiple sessions by comma-separated IDs/indices in one command

**Independent Test**: `cursor-history migrate-session 1,3,5 /dest/path` moves all three sessions

### Implementation for User Story 2

- [x] T019 [US2] Update migrate-session command to accept comma-separated identifiers in src/cli/commands/migrate-session.ts
- [x] T020 [US2] Implement batch migration loop in src/core/migrate.ts (call single-session for each)
- [x] T021 [US2] Add per-session result reporting (success/failure) in src/cli/commands/migrate-session.ts
- [x] T022 [US2] Handle partial failures: continue with remaining sessions, report all results in src/core/migrate.ts

**Checkpoint**: Multiple session migration works via CLI

---

## Phase 5: User Story 3 - Move All History (Workspace-Level) (Priority: P1)

**Goal**: Move all sessions from source workspace path to destination in one command

**Independent Test**: `cursor-history migrate /old/path /new/path` moves all sessions from old to new

### Implementation for User Story 3

- [x] T023 [US3] Create migrateWorkspace() function in src/core/migrate.ts (uses migrateSession internally)
- [x] T024 [US3] Implement session listing for source workspace path (exact match) in src/core/migrate.ts
- [x] T025 [US3] Create migrate CLI command in src/cli/commands/migrate.ts
- [x] T026 [US3] Register migrate command in src/cli/index.ts
- [x] T027 [US3] Add validation: source has sessions, destination workspace exists in src/core/migrate.ts
- [x] T028 [US3] Add aggregate result reporting in src/cli/commands/migrate.ts
- [x] T029 [US3] Handle --force flag for destination with existing history in src/cli/commands/migrate.ts

**Checkpoint**: Workspace-level migration works via CLI

---

## Phase 6: User Story 4 - Copy Sessions (Priority: P2)

**Goal**: Duplicate sessions to new workspace while keeping originals (--copy flag)

**Independent Test**: `cursor-history migrate-session --copy <id> /dest` keeps original and creates copy

### Implementation for User Story 4

- [x] T030 [US4] Add --copy flag to migrate-session command in src/cli/commands/migrate-session.ts
- [x] T031 [US4] Implement copy mode in migrateSession(): generate new session ID in src/core/migrate.ts
- [x] T032 [US4] Implement bubble data duplication in global storage for copy mode in src/core/migrate.ts
- [x] T033 [US4] Update composerData duplication with new ID in src/core/migrate.ts
- [x] T034 [US4] Add --copy flag to migrate command in src/cli/commands/migrate.ts
- [x] T035 [US4] Return newSessionId in result for copy operations in src/core/migrate.ts

**Checkpoint**: Copy mode works for both session and workspace migration

---

## Phase 7: User Story 5 - Library API (Priority: P2)

**Goal**: Expose migration functions for programmatic use via library

**Independent Test**: `import { migrateSession } from 'cursor-history'` works and returns typed results

### Implementation for User Story 5

- [x] T036 [P] [US5] Create library wrapper migrateSession() in src/lib/index.ts (uses core function)
- [x] T037 [P] [US5] Create library wrapper migrateWorkspace() in src/lib/index.ts (uses core function)
- [x] T038 [US5] Add type guards (isSessionNotFoundError, etc.) to src/lib/errors.ts
- [x] T039 [US5] Export migration functions and types from src/lib/index.ts
- [x] T040 [US5] Add JSDoc documentation with examples to library functions in src/lib/index.ts

**Checkpoint**: Library API provides equivalent functionality to CLI

---

## Phase 8: User Story 6 - Dry Run Preview (Priority: P3)

**Goal**: Preview migration without making changes (--dry-run flag)

**Independent Test**: `cursor-history migrate --dry-run /old /new` shows what would happen, makes no changes

### Implementation for User Story 6

- [x] T041 [US6] Add --dry-run flag to migrate-session command in src/cli/commands/migrate-session.ts
- [x] T042 [US6] Implement dryRun mode in migrateSession(): skip DB writes, return preview in src/core/migrate.ts
- [x] T043 [US6] Add --dry-run flag to migrate command in src/cli/commands/migrate.ts
- [x] T044 [US6] Format dry-run output: list sessions that would be migrated in src/cli/commands/migrate.ts
- [x] T045 [US6] Ensure dryRun flag propagates through library API in src/lib/index.ts

**Checkpoint**: Dry-run works for all migration commands

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, error messages, edge cases

- [x] T046 [P] Update CLAUDE.md with migrate commands documentation
- [x] T047 [P] Add help text with examples to migrate-session command in src/cli/commands/migrate-session.ts
- [x] T048 [P] Add help text with examples to migrate command in src/cli/commands/migrate.ts
- [x] T049 Verify error messages are actionable (close Cursor, check paths, etc.)
- [ ] T050 Run quickstart.md validation scenarios manually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 (P1): Core primitive, must complete first
  - US2 (P1): Builds on US1
  - US3 (P1): Builds on US1/US2
  - US4 (P2): Builds on US1, can parallel with US5/US6
  - US5 (P2): Builds on US1-US3
  - US6 (P3): Builds on US1-US3
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - MVP core primitive
- **User Story 2 (P1)**: Requires US1 - extends single to multiple
- **User Story 3 (P1)**: Requires US1/US2 - workspace-level wrapper
- **User Story 4 (P2)**: Requires US1 - adds copy mode
- **User Story 5 (P2)**: Requires US1-US3 - library wrappers
- **User Story 6 (P3)**: Requires US1-US3 - dry-run mode

### Parallel Opportunities

- T002, T003 can run in parallel (different files)
- T036, T037 can run in parallel (different functions in same file)
- T046, T047, T048 can run in parallel (documentation tasks)

---

## Parallel Example: Phase 1 Setup

```bash
# These can run in parallel (different files):
Task: "Add migration error classes to src/lib/errors.ts"
Task: "Add migration types to src/lib/types.ts"
```

## Parallel Example: Phase 7 Library API

```bash
# These can run in parallel (different functions):
Task: "Create library wrapper migrateSession() in src/lib/index.ts"
Task: "Create library wrapper migrateWorkspace() in src/lib/index.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup (types and errors)
2. Complete Phase 2: Foundational (DB helpers, path utilities)
3. Complete Phase 3: User Story 1 (single session move)
4. **STOP and VALIDATE**: Test `migrate-session 1 /new/path`
5. Complete Phase 4: User Story 2 (multiple sessions)
6. Complete Phase 5: User Story 3 (workspace migrate)
7. **MVP COMPLETE**: Core migration functionality works

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test single session → Demo
3. Add US2 → Test multiple sessions → Demo
4. Add US3 → Test workspace migrate → Demo (MVP!)
5. Add US4 → Test copy mode → Demo
6. Add US5 → Test library API → Demo
7. Add US6 → Test dry-run → Demo
8. Polish phase → Documentation complete

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Core migration logic in src/core/migrate.ts (shared by CLI and library)
- CLI commands in separate files (migrate-session.ts, migrate.ts)
- Library wrappers just call core functions with type conversions
