# Implementation Plan: Migrate Workspace History

**Branch**: `003-migrate-workspace` | **Date**: 2025-12-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-migrate-workspace/spec.md`

## Summary

Add session-level and workspace-level migration commands to cursor-history. The core primitive is `migrate-session` which moves/copies individual sessions by ID to a destination workspace path. The `migrate` command is a convenience wrapper that migrates all sessions from a source path using migrate-session internally. This layered design reduces redundancy and enables fine-grained control.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode enabled)
**Primary Dependencies**: better-sqlite3, commander, picocolors, node:fs (for workspace.json writes)
**Storage**:
- Workspace storage (`workspaceStorage/*/state.vscdb`) - session data in `ItemTable`
- Global storage (`globalStorage/state.vscdb`) - full AI responses in `cursorDiskKV`
- Workspace mapping (`workspace.json`) - folder path association
**Testing**: Vitest for unit/integration tests
**Target Platform**: Node.js 20+, cross-platform (Windows, macOS, Linux)
**Project Type**: Single project (CLI + library)
**Performance Goals**: Migration of 100 sessions within 10 seconds (per SC-010)
**Constraints**: Must close Cursor before migration (database lock), preserve all session data
**Scale/Scope**: Typical workspace has 1-50 sessions; rare cases may have 100+

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | ✅ Pass | Single core function (migrateSession), wrapper for bulk. Direct file/DB operations. |
| II. CLI-Native Design | ✅ Pass | Two commands: `migrate-session <ids> <dest>` and `migrate <src> <dest>`. Standard flags. |
| III. Documentation-Driven | ✅ Pass | Will document in README, help text with examples, error messages are actionable. |
| IV. Incremental Delivery | ✅ Pass | P1: migrate-session (core). P1: migrate (uses core). P2: copy mode. P3: dry-run. |
| V. Defensive Parsing | ✅ Pass | Validate session exists, paths differ, handle locked DB, report partial failures. |

**Gate Status**: ✅ PASSED - No violations requiring justification.

## Architecture

### Layered Design

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │  migrate-session    │    │         migrate                 │ │
│  │  <ids> <dest>       │    │  <source> <destination>         │ │
│  └──────────┬──────────┘    └───────────────┬─────────────────┘ │
│             │                               │                    │
│             │         ┌─────────────────────┘                    │
│             │         │ (calls for each session)                 │
│             ▼         ▼                                          │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core Layer (src/core/)                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              migrateSession(options)                        ││
│  │  - Resolves session ID/index                                ││
│  │  - Updates workspace.json OR creates new workspace dir      ││
│  │  - For copy: duplicates session data in ItemTable           ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Library Layer (src/lib/)                      │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │  migrateSession()   │    │  migrateWorkspace()             │ │
│  │  (core primitive)   │    │  (uses migrateSession)          │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

### Documentation (this feature)

```text
specs/003-migrate-workspace/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.ts           # TypeScript interfaces
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── commands/
│   │   ├── migrate-session.ts  # NEW: core migrate command (single/multiple sessions)
│   │   ├── migrate.ts          # NEW: workspace-level migrate (uses migrate-session)
│   │   ├── list.ts
│   │   ├── show.ts
│   │   ├── search.ts
│   │   └── export.ts
│   ├── formatters/
│   └── index.ts                # Register both migrate commands
├── core/
│   ├── storage.ts              # ADD: migrateSession(), findWorkspaceForSession()
│   ├── migrate.ts              # NEW: core migration logic (extracted for clarity)
│   ├── parser.ts
│   └── types.ts                # ADD: MigrateSessionOptions, MigrationResult
└── lib/
    ├── index.ts                # EXPORT: migrateSession(), migrateWorkspace()
    ├── types.ts                # ADD: MigrateSessionConfig, MigrationResult
    └── errors.ts               # ADD: SessionNotFoundError, MigrationError

tests/
├── unit/
│   └── migrate.test.ts         # Unit tests for migration logic
└── integration/
    └── migrate.test.ts         # Integration tests with real DB fixtures
```

**Structure Decision**: Follows existing single project structure. Core migration logic in dedicated `migrate.ts` file (shared by both commands). Both CLI commands in separate files for clarity.

## Complexity Tracking

> No Constitution violations - table not needed.
