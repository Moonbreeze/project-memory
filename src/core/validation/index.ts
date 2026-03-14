import { RequiredFrontmatterKey, isDocumentSource, isDocumentStatus, isFrontmatterKey } from "../types/index.ts";
import type { DocumentType, RepositoryContext, ValidationResult } from "../types/index.ts";

const requiredSectionsByType: Record<DocumentType, string[]> = {
  "session-note": ["## Summary", "## Actions", "## Follow-up"],
  "verification-result": ["## Scope", "## Steps", "## Result"],
  "provider-note": ["## Overview", "## Constraints", "## Guidance"],
  decision: ["## Context", "## Decision", "## Consequences"],
  runbook: ["## Purpose", "## Procedure", "## Verification"],
  "canonical-doc": ["## Summary", "## Guidance", "## References"],
};

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:api|access|secret|auth|private|session)[_-]?(?:key|token|secret|password)\b\s*[:=]\s*\S+/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
];

const envLinePattern = /^\s*(?:export\s+)?[A-Z][A-Z0-9_]*\s*=\s*.+$/m;

const looksLikeRawDump = (body: string): boolean => {
  const lines = body.split(/\r?\n/);
  if (lines.length < 18) {
    return false;
  }

  let machineLike = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("$ ") ||
      trimmed.startsWith("> ") ||
      trimmed.startsWith("at ") ||
      trimmed.startsWith("| ") ||
      trimmed.startsWith("diff --git ") ||
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)
    ) {
      machineLike += 1;
    }
  }

  return machineLike >= 12;
};

/**
 * Validates normalized frontmatter metadata.
 */
export const validateFrontmatter = (
  context: RepositoryContext,
  metadata: Record<string, string>,
  type?: DocumentType,
): ValidationResult => {
  const errors: string[] = [];

  for (const key of Object.keys(metadata)) {
    if (!isFrontmatterKey(key)) {
      errors.push(`Unknown metadata field: ${key}`);
    }
  }

  for (const field of RequiredFrontmatterKey) {
    if (!metadata[field]) {
      errors.push(`Missing required metadata field: ${field}`);
    }
  }

  if (metadata.project && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.project)) {
    errors.push("Project must use kebab-case");
  }

  if (metadata.date && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.date)) {
    errors.push("Date must use YYYY-MM-DD format");
  }

  if (metadata.registry_scope && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.registry_scope)) {
    errors.push("registry_scope must use kebab-case");
  }

  if (type === "canonical-doc" && !metadata.registry_scope) {
    errors.push("Missing required metadata field: registry_scope");
  }

  const source = metadata.source;
  if (source && !isDocumentSource(source)) {
    errors.push(`Unsupported source: ${source}`);
  } else if (source && isDocumentSource(source) && !context.allowedSources.includes(source)) {
    errors.push(`Unsupported source: ${source}`);
  }

  const status = metadata.status;
  if (status && !isDocumentStatus(status)) {
    errors.push(`Unsupported status: ${status}`);
  } else if (status && isDocumentStatus(status) && !context.allowedStatuses.includes(status)) {
    errors.push(`Unsupported status: ${status}`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
};

/**
 * Validates a Markdown body against safety and document-structure rules.
 */
export const validateBody = (
  context: RepositoryContext,
  type: DocumentType,
  body: string,
): ValidationResult => {
  const errors: string[] = [];

  if (Buffer.byteLength(body, "utf8") > context.maxDocumentBytes) {
    errors.push(`Document body exceeds ${context.maxDocumentBytes} bytes`);
  }

  for (const pattern of secretPatterns) {
    if (pattern.test(body)) {
      errors.push("Document body contains secret-like content");
      break;
    }
  }

  if (envLinePattern.test(body)) {
    errors.push("Document body contains .env-style content");
  }

  if (looksLikeRawDump(body)) {
    errors.push("Document body looks like raw command output or an unreviewed dump");
  }

  for (const section of requiredSectionsByType[type]) {
    if (!body.includes(section)) {
      errors.push(`Document body is missing required section: ${section}`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
};
