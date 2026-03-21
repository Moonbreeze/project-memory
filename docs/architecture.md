# Architecture

This document describes the stable architecture of the `project-memory` tool repository.
It is aimed at contributors who need the system model, retrieval model, and implementation constraints.
It assumes the reader already knows the user-facing core concepts from the [README](../README.md).

## System Boundary

`project-memory` is split into two repositories:

- tool repo: this repository, containing code, templates, wrappers, install flow, and tests
- memory repo: an external repository containing managed Markdown documents

The external memory repository is selected through `PROJECT_MEMORY_ROOT`.
That split is deliberate:

- the tool repo remains portable and publishable
- managed project documents stay outside the main code repository
- git history for code and managed knowledge remain separable

## Design Goals

The system is built for agent-assisted software work rather than for free-form note storage.
Contributors should read the codebase with three goals in mind:

- keep managed documents in the external memory repo as the source of truth
- provide narrow, automatable retrieval surfaces instead of open-ended repository scans
- keep CLI and MCP behavior aligned through shared core logic

## Main Code Areas

- `src/core/`: document parsing, validation, storage, search, bounded reads, git helpers, archive logic, and work-item planning logic
- `src/cli/`: local command handlers built as a thin surface over `src/core/`
- `src/mcp/`: MCP server, tool registration, and tool input parsing built as a thin surface over `src/core/`
- `templates/`: managed document templates
- `tests/`: core, CLI, MCP, and install/e2e coverage

## Managed Document Model

The tool works with project-scoped Markdown documents plus frontmatter.
The runtime supports seven managed document roles: `session-note`, `verification-result`, `provider-note`, `decision`, `runbook`, `canonical-doc`, and `work-item`.

Each document type has:

- a stable repository path shape
- validated frontmatter
- a bounded set of statuses
- a deterministic body template or parser

The model is intentionally document-first rather than database-first.
Files remain inspectable in git, while the tool enforces stable structure and path conventions around them.

## Document Responsibility Model

The document taxonomy is not only a storage concern.
It is also how the system separates execution tracking, session chronology, durable rationale, verification evidence, and stable reference knowledge.

This separation is what allows bounded reads and agent workflows to retrieve the right kind of context without treating every markdown file as interchangeable.

When the taxonomy is violated, bounded reads become less trustworthy because unrelated semantics start to share the same retrieval surface.

For decision records specifically, the separation between immutable rationale and mutable stable guidance is enforced at write time through the shared core used by both CLI and MCP surfaces.

## Path Model

Active documents live under the memory repo `projects/` tree.
The `archives/` tree is reserved for moved historical records whose archive semantics are path-based rather than status-based.

Representative active paths:

- `projects/<project>/session-log/<year>/<month>/<date>-<topic>.md`
- `projects/<project>/verification/<year>/<date>-<topic>.md`
- `projects/<project>/provider-notes/<topic>.md`
- `projects/<project>/decisions/<year>/<date>-<topic>.md`
- `projects/<project>/runbooks/<topic>.md`
- `projects/<project>/canonical-docs/<registry-scope>/<topic>.md`
- `projects/<project>/work-items/<year>/<date>-<topic>.md`

Decision paths are part of the durable identity of the record.
The runtime rejects silent overwrite of an existing `projects/<project>/decisions/<year>/<date>-<topic>.md` path; a new durable decision must be recorded as a new dated topic path or handled through explicit lifecycle semantics such as supersession.

Archive behavior is intentionally split by document role:

- `session-note` and `verification-result` archive by moving into `archives/` because they are append-only historical records once retired from active read surfaces
- `provider-note`, `decision`, `runbook`, `canonical-doc`, and `work-item` archive in place by switching to `status: archived`

For work items, archive is not the normal moment of completion.
Completion is represented first through `work_item_state` such as `done` or `canceled`; archive is a later visibility decision for slices that should leave the active planning surface.

The in-place archive rule is part of the domain model, not just an implementation shortcut.
For these document types, the `projects/` path is part of the document's stable identity and, for some types, part of its authority boundary.
Moving them into a second tree would conflate semantic lifecycle with storage relocation, destabilize stable references, and make partial migration or authority reasoning harder than a status transition.

The tool repo never becomes the source of truth for these managed records.
It only provides the runtime, templates, validation, and retrieval surfaces that operate on the external repository.

## Work-Item Model

Work items represent executable backlog slices rather than architectural truth.

They use two separate axes:

- document `status`: for managed document lifecycle
- `work_item_state`: for execution lifecycle

That split lets the tool distinguish document visibility from execution progress.

Work items can store:

- origin metadata
- explicit dependency locators to other work items
- explicit same-project context locators
- verification targets
- explicit same-project evidence locators

The evidence field is part of the model, not incidental annotation.
It is the structured link between execution chronology and checks:

- `session-note` locators explain what happened during execution
- `verification-result` locators record what was checked

The runtime treats that relationship as part of closure semantics rather than as optional annotation on finished work.

The current runtime model keeps those relationships same-project by default.

## Search, List, And Read Model

The tool provides three broad retrieval layers:

- list/search/read of individual managed documents
- preset-based listing such as backlog or ideas
- bounded read entrypoints for common agent retrieval patterns

`list-documents` returns metadata only by default.
`read-document` is the direct path-based full read surface.
`search-documents` returns matched documents with excerpts.

These layers intentionally serve different callers:

- direct reads and searches are maintenance primitives
- presets provide a small amount of opinionated shaping over generic listing
- bounded reads are the preferred startup surface for recurring MCP-driven workflows

## Bounded Read Architecture

Bounded reads return a structured package rather than an open-ended project scan.
Each bounded read contains:

- selected documents
- explainable stages
- notes about fallbacks or intentional omissions
- planning explainability when the entrypoint is work-item planning oriented

Current bounded entrypoints cover startup context, planning backlog, exact-topic planning context, current-topic truth, and durable rationale lookups.

The planning entrypoints are work-item aware and follow only explicit same-project dependency, context, and evidence references with fixed limits.

That explicit evidence surface is part of why the closure invariant matters.
Bounded reads stay explainable because a finished work-item can point directly to its own execution chronology and checks instead of expecting a reader to rediscover them elsewhere.

This is the core architectural tradeoff of the project.
The tool does less than a fully open retrieval system on purpose so callers can trust scope, ordering, and explainability.

## Retrieval Constraints

The retrieval model intentionally favors bounded and deterministic behavior.
These constraints are part of the runtime contract, not temporary implementation shortcuts.

Key guardrails:

- same-project defaults for planning relationships
- fixed per-stage limits in bounded reads
- deterministic ordering by planning state, date, and path as appropriate
- no implicit cross-project aggregation in default planning or bounded read flows
- no recursive graph walking in reference-follow stages
- project-scoped commit validation for managed document commits
- explicit remote push behavior instead of implicit origin sync during commit

## Interaction Surfaces

The CLI and MCP server expose the same core capabilities over different interaction models.
Both surfaces ultimately call the shared `src/core/` logic so that validation, parsing, bounded read behavior, and commit rules stay consistent.
They are parallel surfaces over the same core behavior, not layers that depend on each other.

That shared-core rule also applies to the decision write contract.
CLI and MCP both forward structured stable-guidance review inputs into the same core enforcement layer, so immutability and non-draft review requirements do not depend on which surface initiated the write.

Contributors should preserve one document model and one retrieval model across both surfaces.
Human-readable browsing, if added, should remain a projection over the same underlying managed files rather than a separate source of truth.
