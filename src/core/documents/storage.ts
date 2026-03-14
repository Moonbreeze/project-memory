import fs from "node:fs";
import path from "node:path";

import { createRepositoryContext } from "../config/index.ts";
import { isDocumentSource, isDocumentStatus } from "../types/index.ts";
import { validateBody, validateFrontmatter } from "../validation/index.ts";
import { validateStoredWorkItemDocument } from "../workItems/index.ts";
import type { Frontmatter, ParsedDocument, RepositoryContext } from "../types/index.ts";

import { buildFrontmatter, parseFrontmatter } from "./content.ts";
import {
  isActiveDocumentRelativePath,
  isManagedDocumentRelativePath,
  resolveDocumentTypeFromRelativePath,
} from "./pathLayout.ts";

/**
 * Ensures that the given path stays within approved managed document roots.
 */
const assertManagedDocumentRelativePath = (relativePath: string): void => {
  if (!isManagedDocumentRelativePath(relativePath)) {
    throw new Error("Writes are limited to approved project-memory document paths");
  }
};

/**
 * Converts raw frontmatter key-value pairs into a typed object.
 */
const normalizeFrontmatter = (metadata: Record<string, string>): Frontmatter => {
  const normalized: Frontmatter = {
    date: metadata.date,
    project: metadata.project,
    topic: metadata.topic,
    source: "agent",
    status: "active",
  };

  if (!isDocumentSource(metadata.source) || !isDocumentStatus(metadata.status)) {
    throw new Error("Document frontmatter contains unsupported source or status");
  }

  normalized.source = metadata.source;
  normalized.status = metadata.status;

  if (metadata.registry_scope) {
    normalized.registry_scope = metadata.registry_scope;
  }

  if (metadata.work_item_state) {
    normalized.work_item_state = metadata.work_item_state;
  }

  return normalized;
};

/**
 * Validates and writes one Markdown document to disk.
 */
export const writeDocument = (
  context: RepositoryContext,
  relativePath: string,
  metadata: Frontmatter,
  body: string,
): ParsedDocument => {
  assertManagedDocumentRelativePath(relativePath);
  const type = resolveDocumentTypeFromRelativePath(relativePath);

  const frontmatterValidation = validateFrontmatter(context, metadata, type);
  if (!frontmatterValidation.ok) {
    throw new Error(frontmatterValidation.errors.join("; "));
  }

  const bodyValidation = validateBody(context, type, body);
  if (!bodyValidation.ok) {
    throw new Error(bodyValidation.errors.join("; "));
  }

  if (type === "work-item") {
    validateStoredWorkItemDocument({
      path: "",
      relativePath,
      type,
      metadata,
      body: body.trimEnd(),
    });
  }

  const absolutePath = path.join(context.memoryRootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  const documentText = `${buildFrontmatter(metadata)}${body.trimEnd()}\n`;
  fs.writeFileSync(absolutePath, documentText, "utf8");

  return {
    path: absolutePath,
    relativePath,
    type,
    metadata,
    body: body.trimEnd(),
  };
};

/**
 * Reads one stored document from an approved repository-relative path.
 */
export const readDocument = (
  context: RepositoryContext,
  relativePath: string,
): ParsedDocument => {
  assertManagedDocumentRelativePath(relativePath);

  const absolutePath = path.join(context.memoryRootDir, relativePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const { metadata, body } = parseFrontmatter(raw);
  const type = resolveDocumentTypeFromRelativePath(relativePath);
  const frontmatterValidation = validateFrontmatter(context, metadata, type);

  if (!frontmatterValidation.ok) {
    throw new Error(frontmatterValidation.errors.join("; "));
  }

  const parsedDocument = {
    path: absolutePath,
    relativePath,
    type,
    metadata: normalizeFrontmatter(metadata),
    body,
  };

  if (type === "work-item") {
    validateStoredWorkItemDocument(parsedDocument);
  }

  return parsedDocument;
};

/**
 * Lists all active Markdown document paths under `projects/`.
 */
export const listAllActiveDocumentPaths = (
  context = createRepositoryContext(),
): string[] => {
  const collected: string[] = [];

  const walk = (currentDir: string): void => {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.name.endsWith(".md")) {
        continue;
      }

      const relativePath = path.relative(context.memoryRootDir, absolutePath);
      if (!isActiveDocumentRelativePath(relativePath)) {
        continue;
      }

      collected.push(relativePath);
    }
  };

  walk(context.projectsDir);
  return collected.sort();
};
