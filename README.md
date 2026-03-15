# Project Memory

`project-memory` is a standalone tool for managing a private, multi-project knowledge base for AI agents.
This repository contains the install flow, CLI, MCP server, validation, bounded read helpers, templates, and tests.
The managed documents themselves live in a separate external repository selected through `PROJECT_MEMORY_ROOT`.

## Core Concepts

- Repo split: this repository is the tool repo; managed documents live in a separate external memory repo, with active managed paths under `projects/` and moved historical session or verification records under `archives/`.
- MCP-first workflow: normal interactive work happens through an agent using bounded reads and managed write tools over MCP.
- Secondary CLI: the CLI is the exact local surface for automation, debugging, and maintenance. It is intentionally structured rather than optimized for browsing.
- Archive semantics: archiving is a lifecycle operation, not always a file move. `session-note` and `verification-result` move into `archives/`, while `decision`, `runbook`, `provider-note`, and `canonical-doc` keep their stable `projects/` paths and switch to `status: archived`. `work-item` uses its dedicated lifecycle helper and also archives in place.

## Quickstart

Prerequisites:

- Node.js 22.6 or newer
- `git`

Example paths used below:

- tool repo checkout: `~/project-memory-tool`
- external memory repo: `~/acme-memory`
- example project slug inside the memory repo: `acme-api`

Install dependencies:

```bash
npm install
```

Create a separate memory repository and bootstrap one project:

```bash
npm run install-memory -- --memory-root ~/acme-memory --project acme-api --git-init true
```

This creates:

- `~/acme-memory/projects/`
- `~/acme-memory/archives/`
- a git repository at `~/acme-memory/.git`
- an initial project tree under `~/acme-memory/projects/acme-api/`
- `.project-memory.env` in this repo
- local fallback MCP config snippets for Codex and Claude
- optional global Codex and Claude MCP registration unless disabled with flags

Today the supported local entrypoints are wrappers:

```bash
./scripts/run-cli.sh list-documents --project acme-api
./scripts/run-mcp.sh
```

The wrappers source `.project-memory.env` automatically, so you normally do not need to export `PROJECT_MEMORY_ROOT` by hand.
They are intentionally low-level entrypoints, not polished end-user commands.

## Install Command

`install-memory` is the intended onboarding path:

```bash
npm run install-memory -- --memory-root ~/acme-memory --project acme-api --git-init true
```

Important flags:

- `--memory-root`: required external memory repository path; it must not overlap the tool repo
- `--project`: optional initial project slug to bootstrap
- `--git-init`: optional, defaults to `true`
- `--codex-global`: optional, defaults to `true`
- `--claude-global`: optional, defaults to `true`

If you disable global client registration, the command still writes local fallback snippets:

- `.project-memory.codex.toml`
- `.project-memory.claude.mcp.json`

## Verification

Run the default automated coverage:

```bash
npm test
```

For the process-level stdio lifecycle check, run:

```bash
npm run test:stdio-integration
```

## Read Next

- [`docs/usage.md`](docs/usage.md): document responsibilities, working lifecycle, and migration scenarios
- [`docs/architecture.md`](docs/architecture.md): contributor-facing system model, bounded reads, and retrieval constraints
