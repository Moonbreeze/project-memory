# Memory Policy

## Purpose

This repository stores structured operational memory for projects and agent workflows.
It is not a general dump for logs, credentials, or copied artifacts.

## Allowed Content

- session notes summarizing work performed
- verification results with scoped outcomes
- provider notes documenting constraints and guidance
- decisions with context and consequences
- runbooks for repeatable operational tasks

## Prohibited Content

- secrets, API keys, tokens, passwords, or private keys
- raw `.env` content or environment exports
- customer-sensitive or user-sensitive data
- unreviewed logs, stack dumps, or terminal transcripts
- bulk copied command output without editorial review

## Storage Rules

- active documents live under `projects/<project>/`
- archived records live under `archives/<project>/`
- project identifiers must use `kebab-case`
- documents must use Markdown with constrained YAML frontmatter
- writes must go through approved local wrappers or MCP operations

## Validation Rules

- reject unknown metadata fields
- reject missing required metadata
- reject secret-like strings and `.env`-style lines
- reject machine-generated raw dumps
- reject oversized payloads

## Archive Rules

- archives are excluded from default active search and listing
- archives are not working context unless explicitly requested
- only session logs and verification results are archived in the MVP
