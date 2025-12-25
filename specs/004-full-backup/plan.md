# Implementation Plan: Full Backup and Restore

**Branch**: `004-full-backup` | **Date**: 2025-12-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-full-backup/spec.md`

## Summary

Implement a full backup and restore feature for Cursor chat history that:
1. Creates zip archives of all DB files using SQLite backup API for hot backups
2. Allows viewing/searching backup contents directly from zip (streaming into memory)
3. Restores backups with integrity verification and rollback on failure
4. Lists available backups with metadata (date, size, session count)

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode enabled)
**Runtime**: Node.js 20 LTS
**Primary Dependencies**:
- better-sqlite3 (existing - SQLite backup API support)
- commander (existing - CLI framework)
- picocolors (existing - terminal colors)
- adm-zip (NEW - zip read/write)

**Storage**: SQLite databases (state.vscdb files) + zip archives
**Testing**: Vitest (existing)
**Target Platform**: Windows, macOS, Linux (cross-platform)
**Project Type**: Single project (CLI + Library)
**Performance Goals**:
- Backup creation: <30 seconds for 1GB dataset (SC-001)
- Backup viewing: Same response time as live data (SC-002)
**Constraints**:
- Memory: DB files loaded into memory for streaming from zip
- Disk: Check available space before backup creation
**Scale/Scope**: Typical user datasets up to 1GB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | ✅ PASS | Uses existing patterns; minimal new dependencies (zip handling only) |
| II. CLI-Native Design | ✅ PASS | New commands follow existing conventions; --force, --json flags |
| III. Documentation-Driven | ✅ PASS | Spec complete; will add help text and examples |
| IV. Incremental Delivery | ✅ PASS | 4 user stories with clear priority ordering (P1-P4) |
| V. Defensive Parsing | ✅ PASS | Graceful degradation for corrupted backups; checksums; rollback |

**Technical Standards Compliance**:
- [x] TypeScript strict mode
- [x] Minimal dependencies (only adding zip handling)
- [x] Core logic decoupled from CLI (library API support)
- [x] Vitest for testing

## Project Structure

### Documentation (this feature)

```text
specs/004-full-backup/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── backup.ts        # NEW: Core backup/restore logic
│   ├── storage.ts       # MODIFY: Add backup source abstraction
│   ├── migrate.ts       # Existing
│   ├── parser.ts        # Existing
│   └── types.ts         # MODIFY: Add backup types
├── cli/
│   ├── commands/
│   │   ├── backup.ts    # NEW: backup command
│   │   ├── restore.ts   # NEW: restore command
│   │   ├── list-backups.ts # NEW: list-backups command
│   │   ├── list.ts      # MODIFY: Add --backup option
│   │   ├── show.ts      # MODIFY: Add --backup option
│   │   ├── search.ts    # MODIFY: Add --backup option
│   │   └── export.ts    # MODIFY: Add --backup option
│   ├── formatters/
│   └── index.ts         # MODIFY: Register new commands
└── lib/
    ├── index.ts         # MODIFY: Export backup functions
    ├── types.ts         # MODIFY: Add backup types
    └── backup.ts        # NEW: Library backup API

tests/
├── unit/
│   └── backup.test.ts   # NEW: Backup unit tests
└── integration/
    └── backup.test.ts   # NEW: Backup integration tests
```

**Structure Decision**: Follows existing single-project structure. New backup functionality in `src/core/backup.ts` with CLI commands and library exports mirroring existing patterns.

## Complexity Tracking

No violations requiring justification. Design follows existing patterns with minimal additions.

---

## Post-Design Constitution Check

*Re-evaluated after Phase 1 design artifacts complete.*

| Principle | Status | Post-Design Notes |
|-----------|--------|-------------------|
| I. Simplicity First | ✅ PASS | Single new dependency (adm-zip); reuses existing patterns |
| II. CLI-Native Design | ✅ PASS | Commands follow POSIX conventions; exit codes defined |
| III. Documentation-Driven | ✅ PASS | quickstart.md, contracts/, data-model.md created |
| IV. Incremental Delivery | ✅ PASS | P1-P4 stories independently testable; contracts define clear interfaces |
| V. Defensive Parsing | ✅ PASS | Checksum verification; graceful degradation; rollback on failure |

**Design Artifacts Created**:
- `research.md` - Technical decisions documented with rationale
- `data-model.md` - All entities, validation rules, state transitions
- `contracts/cli-api.md` - CLI commands with examples and exit codes
- `contracts/library-api.md` - Library functions with TypeScript signatures
- `quickstart.md` - Usage examples for common workflows

**Ready for**: `/speckit.tasks` to generate implementation tasks
