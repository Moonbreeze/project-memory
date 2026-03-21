# Known Bugs

## Bug #1

- Topic: `fail-soft-backlog-reads-on-invalid-work-items`
- Status: fixed by regression coverage in this repository
- Summary: Backlog-facing mass-read surfaces used to abort when an unrelated active `done` work-item violated the session-note evidence invariant.
- Expected behavior: `read_planning_backlog` and `list_documents` keep returning usable results while surfacing explicit invalid-document diagnostics for skipped work-items.
- Covering tests:
  - `tests/core/documentFlow.test.ts`
  - `tests/mcp/server.test.ts`
