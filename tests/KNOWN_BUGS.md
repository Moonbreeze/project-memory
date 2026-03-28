# Known Bugs

## Bug #1

- Topic: `fail-soft-backlog-reads-on-invalid-work-items`
- Status: fixed by regression coverage in this repository
- Summary: Backlog-facing mass-read surfaces used to abort when an unrelated active `done` work-item violated the session-note evidence invariant.
- Expected behavior: `read_planning_backlog` and `list_documents` keep returning usable results while surfacing explicit invalid-document diagnostics for skipped work-items.
- Covering tests:
  - `tests/core/documentFlow.test.ts`
  - `tests/mcp/server.test.ts`

## Bug #2

- Topic: `fix-upsert-work-item-repair-flow-for-invalid-done-items`
- Status: fixed by regression coverage in this repository
- Summary: `upsert_work_item` cannot repair an already-invalid `done` work-item when the fix should add `session-note` evidence or change `workItemState`, because the write path reads and validates the stored work-item while resolving `recorded_at` before the new input is applied.
- Expected behavior: `upsert_work_item` should validate and write the new input so an invalid stored `done` work-item can be repaired without requiring the old document to already satisfy the done-state evidence invariant.
- Covering tests:
  - `tests/core/documentFlow.test.ts`
  - `tests/mcp/server.test.ts`

## Bug #4

- Topic: `preserve-current-time-for-explicit-current-day-recorded-at`
- Status: fixed by regression coverage in this repository
- Summary: New managed documents written with an explicit `date` equal to today's UTC day used to collapse `recorded_at` to `T00:00:00.000Z` instead of capturing the actual write time, which made current-day timeline ordering misleading in the Web UI and other chronology-aware reads.
- Expected behavior: New current-day writes should capture the current UTC timestamp even when the caller passes today's `date` explicitly, while historical explicit dates should keep the deterministic day-level fallback and same-day rewrites should preserve the stored `recorded_at`.
- Covering tests:
  - `tests/core/documentFlow.test.ts`
