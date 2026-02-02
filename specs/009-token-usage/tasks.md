# Tasks: Token Usage Extraction

**Input**: Design documents from `/specs/009-token-usage/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in specification. Test tasks are included as optional polish tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new types to core and prepare extraction utilities

- [x] T001 Add `TokenUsage`, `SessionUsage`, and `ContextWindowStatus` interfaces to `src/core/types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core extraction functions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Implement `extractTokenUsage()` function in `src/core/storage.ts` — handles both camelCase and snake_case formats, plus fallbacks to contextWindowStatusAtCreation and promptDryRunInfo
- [x] T003 Implement `extractModelInfo()` function in `src/core/storage.ts` — extracts `modelInfo.modelName`
- [x] T004 Implement `extractTimingInfo()` function in `src/core/storage.ts` — calculates duration from `timingInfo`
- [x] T005 Implement `extractSessionUsage()` function in `src/core/storage.ts` — extracts from composer data and aggregates message tokens; must handle both int and float `contextUsagePercent`
- [x] T006 Implement `extractPromptDryRunInfo()` function in `src/core/storage.ts` — parses double-encoded JSON string to extract `fullConversationTokenCount.numTokens` and `userMessageTokenCount.numTokens`
- [x] T007 Extend `Message` interface with optional `tokenUsage`, `model`, `durationMs` fields in `src/core/types.ts`
- [x] T008 Extend `ChatSession` interface with optional `usage: SessionUsage` field in `src/core/types.ts`
- [x] T009 Update bubble extraction in `src/core/storage.ts` to call new extraction functions and populate Message fields

**Checkpoint**: Foundation ready - extraction logic complete, types extended ✅

---

## Phase 3: User Story 1 - View Token Usage Per Message in CLI (Priority: P1) 🎯 MVP

**Goal**: Users see input/output token counts as badges after messages in CLI `show` output

**Independent Test**: Run `cursor-history show <index>` on a session with token data. Verify badge appears after messages with format `[model input→output duration]`.

### Implementation for User Story 1

- [x] T010 [P] [US1] Implement `formatTokenCount()` helper in `src/cli/formatters/table.ts` — formats 131373 as "131k"
- [x] T011 [P] [US1] Implement `formatDuration()` helper in `src/cli/formatters/table.ts` — formats 2300 as "2.3s"
- [x] T012 [US1] Implement `formatUsageBadge()` in `src/cli/formatters/table.ts` — creates `[model input→output duration]` badge string
- [x] T013 [US1] Update `formatSessionDetail()` in `src/cli/formatters/table.ts` to append usage badge after each message content
- [x] T014 [US1] Ensure badge is omitted when message has no token data (zero or missing values)

**Checkpoint**: User Story 1 complete — token badges visible in CLI output ✅

---

## Phase 4: User Story 2 - View Model and Timing Info in CLI (Priority: P2)

**Goal**: Badge includes model name and response duration for assistant messages

**Independent Test**: Run `cursor-history show <index>` on a session with model/timing data. Verify badge shows model name and duration.

### Implementation for User Story 2

- [x] T015 [US2] Handle edge case: badge with model but no token data (show model only)
- [x] T016 [US2] Handle edge case: badge with tokens but no model (show tokens only)
- [x] T017 [US2] Handle edge case: badge with duration but no tokens (show duration only)

**Checkpoint**: User Story 2 complete — model and timing visible in badges ✅

---

## Phase 5: User Story 3 - Session-Level Usage Summary in CLI (Priority: P2)

**Goal**: Users see a session summary block showing total context/token usage at the bottom of output

**Independent Test**: Run `cursor-history show <index>` on a session with context data. Verify summary block appears at bottom of output (after all messages).

### Implementation for User Story 3

- [x] T018 [US3] Implement `formatSessionSummary()` in `src/cli/formatters/table.ts` — formats session usage as summary block
- [x] T019 [US3] Update `formatSessionDetail()` in `src/cli/formatters/table.ts` to render session summary at the bottom when usage data exists
- [x] T020 [US3] Ensure summary is omitted when session has no usage data
- [x] T021 [US3] Format context usage as "111k / 272k (41%)" style; handle both int and float `contextUsagePercent` by rounding to one decimal place

**Checkpoint**: User Story 3 complete — session summary visible in CLI output ✅

---

## Phase 6: User Story 4 - Access Token Usage via Library API (Priority: P3)

**Goal**: Developers can access token data programmatically via `getSession()`

**Independent Test**: Call `getSession(0)` and verify returned Message/Session objects have tokenUsage, model, durationMs, usage fields.

### Implementation for User Story 4

- [x] T022 [P] [US4] Add `TokenUsage` interface to `src/lib/types.ts` (public library types)
- [x] T023 [P] [US4] Add `SessionUsage` interface to `src/lib/types.ts`
- [x] T024 [US4] Extend library `Message` interface with `tokenUsage?`, `model?`, `durationMs?` fields in `src/lib/types.ts`
- [x] T025 [US4] Extend library `Session` interface with `usage?: SessionUsage` field in `src/lib/types.ts`
- [x] T026 [US4] Update `getSession()` in `src/lib/index.ts` to map core types to library types with usage fields

**Checkpoint**: User Story 4 complete — library API exposes all token data ✅

---

## Phase 7: User Story 5 - Token Usage in JSON Output (Priority: P3)

**Goal**: JSON output includes all token, model, timing, and context data

**Independent Test**: Run `cursor-history show <index> --json` and verify JSON includes tokenUsage, model, durationMs on messages and usage on session.

### Implementation for User Story 5

- [x] T027 [US5] Update JSON formatter in `src/cli/formatters/json.ts` to include message-level token fields
- [x] T028 [US5] Update JSON formatter to include session-level usage field
- [x] T029 [US5] Ensure null/zero token fields are omitted from JSON output (not included as null)
- [x] T030 [US5] Update `exportToJson()` in `src/core/parser.ts` to include usage data

**Checkpoint**: User Story 5 complete — JSON output contains all usage data ✅

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Testing, documentation, and edge case handling

- [ ] T031 [P] Create test fixtures with various token data formats in `tests/fixtures/token-usage/`
- [ ] T032 [P] Add unit tests for `extractTokenUsage()` camelCase/snake_case handling in `tests/unit/token-usage.test.ts`
- [ ] T033 [P] Add unit tests for `formatTokenCount()` and `formatDuration()` in `tests/unit/token-usage.test.ts`
- [ ] T034 [P] Add unit tests for edge cases: zero values, missing fields, partial timing data
- [x] T035 Update CLAUDE.md Recent Changes section with 009-token-usage feature summary
- [ ] T036 Run `npm run build && npm test` to verify all tests pass
- [ ] T037 Manual validation: run `cursor-history show 1` on real Cursor data and verify output

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - Core MVP
- **User Story 2 (Phase 4)**: Depends on US1 (extends badge logic)
- **User Story 3 (Phase 5)**: Depends on Foundational only (independent of US1/US2)
- **User Story 4 (Phase 6)**: Depends on Foundational only (library types)
- **User Story 5 (Phase 7)**: Depends on Foundational only (JSON output)
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

```
                    ┌─────────────────┐
                    │  Setup (T001)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Foundational    │
                    │   (T002-T009)   │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐         ┌─────────┐         ┌─────────┐
   │   US1   │         │   US3   │         │  US4/5  │
   │ (P1 MVP)│         │  (P2)   │         │  (P3)   │
   └────┬────┘         └─────────┘         └─────────┘
        │
        ▼
   ┌─────────┐
   │   US2   │
   │  (P2)   │
   └─────────┘
```

### Parallel Opportunities

**User Story 1 (partial parallel):**
```bash
T010, T011 — independent helper functions, can run in parallel
T012, T013 — sequential (T013 uses T012)
```

**User Story 4 (partial parallel):**
```bash
T022, T023 — independent type additions
T024, T025, T026 — sequential (depend on T022, T023)
```

**Polish Phase (all parallel):**
```bash
T031, T032, T033, T034 — all different test files
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002-T009)
3. Complete Phase 3: User Story 1 (T010-T014)
4. **STOP and VALIDATE**: Run `cursor-history show 1` and verify badges appear
5. Deploy/merge if ready — users get immediate value

### Incremental Delivery

1. **MVP**: Setup + Foundational + US1 → Token badges in CLI
2. **+US2**: Add model/timing to badges → Richer context
3. **+US3**: Add session summary → Big picture view
4. **+US4**: Library API → Developer access
5. **+US5**: JSON output → Downstream tooling
6. **Polish**: Tests + docs → Production ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Key files to modify: `src/core/types.ts`, `src/core/storage.ts`, `src/cli/formatters/table.ts`, `src/lib/types.ts`
