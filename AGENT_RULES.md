# Agent Rules

## Shared System

`project-memory` is the canonical project-memory store across agents.
Agent-specific memory systems may exist, but they are not the primary store for these artifacts.

## Write Behavior

- read existing project memory before writing when relevant
- write only through approved CLI or MCP operations
- prefer append or targeted updates over broad rewrites
- do not rewrite historical records unless explicitly instructed
- create new decision records instead of mutating prior decisions

## Safety Rules

- never store secrets, credentials, or raw `.env` data
- do not paste unfiltered command output or logs
- avoid copying customer-sensitive or user-sensitive material
- keep archives outside the active working set unless asked

## MVP Concurrency Rule

Concurrent writes are not resolved automatically in the MVP.
Assume one primary operator for project-memory updates.
