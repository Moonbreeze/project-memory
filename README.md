# Project Memory

`project-memory` is the tool repository for a private, multi-project knowledge base for AI agents.
The code lives here. The actual project memory lives in a separate external repository selected through `PROJECT_MEMORY_ROOT`.

## Quickstart

Prerequisites:

- a Node.js version that supports `--experimental-strip-types`
- `git`

1. Install tool dependencies:

```bash
npm install
```

2. Create a separate memory repository:

```bash
npm run install-memory -- --memory-root ~/project-memory-data --project project-memory --git-init true
```

This creates:

- `~/project-memory-data/projects/`
- `~/project-memory-data/archives/`
- a git repository at `~/project-memory-data/.git`
- an initial `project-memory` project tree
- a global Codex MCP entry in `~/.codex/config.toml`
- a global Claude MCP entry in `~/.claude.json`
- a local shell file at `.project-memory.env`
- a fallback Codex config snippet at `.project-memory.codex.toml`
- a Claude config snippet at `.project-memory.claude.mcp.json`

The install flow now emits only client-specific MCP snippets.
There is no generic legacy `.mcp.json` artifact in the normal path anymore.

3. Use the generated local wrapper for CLI commands:

```bash
./scripts/run-cli.sh list-documents --project project-memory
./scripts/run-cli.sh list-documents --project project-memory --preset backlog
```

4. Use the generated local wrapper for the MCP server:

```bash
./scripts/run-mcp.sh
```

The install command writes `.project-memory.env`, and both wrappers source it automatically.
`PROJECT_MEMORY_ROOT` is still required internally, but you no longer need to export it manually for normal local usage.
Codex global MCP registration is attempted automatically by default.
The MCP server currently accepts protocol revisions `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25`.
If a client requests an unsupported date-based revision, `initialize` negotiates to the nearest supported revision that does not exceed the requested version.

## Normal Workflow

- Use `./scripts/run-cli.sh ...` for local manual operations.
- Use `./scripts/run-mcp.sh` to start the MCP server with the generated env file.
- Commit the tool repository and the memory repository separately.

Examples:

```bash
./scripts/run-cli.sh append-session-note --project project-memory --topic setup --summary "Validated install flow." --actions "created memory repo" --follow-up "document MCP config"
./scripts/run-cli.sh upsert-work-item --project project-memory --topic session-6-work-item-rollout --summary "Implement the first work-item document flow." --outcome "Project backlog can move off decisions." --origin-kind ad-hoc --origin-note "Session 6 implementation work." --verification "Run npm test"
./scripts/run-cli.sh list-documents --project project-memory --preset backlog
./scripts/run-cli.sh commit-pending-changes --message "docs(project-memory/session): record install validation"
```

`list-documents` returns metadata only by default. Use `--include-body true` only when the full Markdown body is actually needed.
For project-scoped queries, the `backlog` preset now uses work-item planning when the project has managed work items. That view keeps only active ready, in-progress, and blocked work items, sorts them by planning state before date, and includes dependency counts in the result. When no project is supplied or the project has no work items yet, the preset falls back to the legacy decision backlog view: `type=decision`, excludes `superseded` and `archived`, and sorts by date descending.

## Install Command

The install command is the intended onboarding path for new users:

```bash
npm run install-memory -- --memory-root ~/project-memory-data --project acme-app --git-init true
```

Flags:

- `--memory-root`: required external memory repository path; it must not overlap the tool repository
- `--project`: optional initial project to bootstrap
- `--git-init`: optional, defaults to `true`
- `--codex-global`: optional, defaults to `true`; set `false` to skip editing `~/.codex/config.toml`
- `--claude-global`: optional, defaults to `true`; set `false` to skip editing `~/.claude.json`

The command also generates:

- `.project-memory.env`: local shell env file with `PROJECT_MEMORY_ROOT`
- updates `~/.codex/config.toml`: global Codex MCP registration for `project-memory`
- updates `~/.claude.json`: global Claude MCP registration for `project-memory`
- `.project-memory.codex.toml`: fallback Codex MCP snippet with the same server definition
- `.project-memory.claude.mcp.json`: Claude MCP snippet for manual review or manual merge into Claude config

Codex usage:

- install updates `~/.codex/config.toml` automatically by default
- if you prefer manual review only, run with `--codex-global false` and merge `.project-memory.codex.toml` yourself

Claude usage:

- install updates `~/.claude.json` automatically by default
- if you prefer manual review only, run with `--claude-global false` and merge `.project-memory.claude.mcp.json` into your Claude config yourself

## Verification

- Run `npm test` for the default unit, CLI, MCP dispatcher, and e2e coverage.
- Run `npm run test:stdio-integration` for the separate process-level stdio lifecycle check.

The stdio integration test is kept outside the default `npm test` path because some sandboxed or agent-driven runners can make nested child-process stdio behavior unreliable. Run it in a normal shell or CI job to verify that the real MCP server process answers framed requests and exits after stdin closes.

## Repository Roles

Tool repository contents:

- `src/core/`: shared path, validation, search, git, and archive logic
- `src/cli/`: local manual interface
- `src/mcp/`: narrow MCP server surface
- `templates/`: document templates used by write operations
- `tests/`: unit and integration coverage

External memory repository contents:

- `projects/`: active project-scoped documents
- `archives/`: archived session notes and verification records
- `projects/<project>/work-items/<year>/`: active work-item records used for backlog planning

## Current MVP Scope

- append session notes
- record verification results
- upsert provider notes
- create decisions
- create runbooks
- upsert canonical docs bound to declared taxonomy-registry scopes
- upsert work items with explicit provenance, dependencies, context, verification, and evidence sections
- list, read, and search active documents
- commit pending document changes
- archive session and verification documents manually
- update work-item lifecycle through `upsert-work-item` or `upsert_work_item`, including close and archive semantics via `work_item_state` and document `status`

## Work-Item Support

`src/core/workItems/` now provides both the Session 5 schema contract and the first Session 6 implementation surface. Work-item documents live under `projects/<project>/work-items/<year>/`, use the `work_item_state` frontmatter field, and serialize provenance, dependency, context, and evidence locators in a deterministic body format.

`list-documents --preset backlog` and `list_documents` now switch to project-scoped work-item planning when work items exist for the requested project. The bounded read entrypoints still intentionally omit work-item sources until a dedicated planning read entrypoint is added.

## Commit Rules

`commit-pending-changes` enforces the commit message format `docs(<project>/<scope>): <summary>`.
Supported scopes are `session`, `verification`, `provider`, `decision`, `runbook`, `canonical`, `work-item`, `archive`, and `mixed`.

The project slug is inferred from the pending managed-document paths, and the default flow only allows one project per commit.
Use `archive` only when the pending changes are strictly archive moves for session notes and verification results.
If archived documents and active `projects/` documents are committed together for the same project, the required scope is `mixed`.
If pending managed documents span multiple projects, commit them separately.

Examples:

- `docs(acme-app/session): resume verification notes`
- `docs(acme-app/provider): claude working agreement`
- `docs(acme-app/canonical): resume policy baseline`
- `docs(acme-app/archive): archive stale notes`
- `docs(acme-app/mixed): archive notes and add follow-up decision`
