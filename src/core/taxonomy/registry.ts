import path from "node:path";

import { createRepositoryContext } from "../config/index.ts";
import {
  currentDate,
  ensureKebabCaseProject,
  listAllActiveDocumentPaths,
  loadTemplate,
  readDocument,
  renderList,
  renderTemplate,
  ensureSlug,
  resolveDocumentRelativePath,
  writeDocument,
} from "../documents/index.ts";
import type {
  Frontmatter,
  ParsedDocument,
  RepositoryContext,
} from "../types/index.ts";

import {
  ReservedTaxonomyRegistryScope,
  ReservedTaxonomyRegistryTopic,
} from "./constants.ts";
import {
  isTaxonomyRegistryEntryState,
  isTaxonomyRegistryMigrationKind,
} from "./types.ts";
import type {
  CanonicalDocTaxonomyValidationInput,
  TaxonomyAuditInput,
  TaxonomyAuditIssue,
  TaxonomyAuditResult,
  TaxonomyRegistryDocument,
  TaxonomyRegistryEntry,
  TaxonomyRegistryInput,
} from "./types.ts";

const registryEntryPrefix = "registry-entry:";
const registrySectionHeading = "## Guidance";
const referencesSectionHeading = "## References";
const activeLikeRegistryStates = new Set(["active", "transitional"]);
const taxonomyAuditSeverityPriority: Record<TaxonomyAuditIssue["severity"], number> = {
  error: 0,
  warning: 1,
};

type RawTaxonomyRegistryEntry = Omit<TaxonomyRegistryEntry, "state" | "migration"> & {
  state: string;
  migration: string;
};

/**
 * One resolved taxonomy registry match for a canonical scope or one of its aliases.
 */
type ResolvedRegistryEntry = {
  /** Parsed registry entry that owns the matched name. */
  entry: TaxonomyRegistryEntry;
  /** Raw scope slug declared by the canonical doc. */
  inputScope: string;
  /** Indicates whether the raw scope matched through an alias instead of the canonical scope. */
  usesAlias: boolean;
};

/**
 * Extracts one Markdown section body by heading.
 */
const extractSectionBody = (body: string, heading: string, nextHeading: string): string => {
  const start = body.indexOf(heading);
  if (start === -1) {
    return "";
  }

  const contentStart = start + heading.length;
  const end = body.indexOf(nextHeading, contentStart);
  if (end === -1) {
    return body.slice(contentStart).trim();
  }

  return body.slice(contentStart, end).trim();
};

/**
 * Extracts flat bullet values from one Markdown section.
 */
const extractSectionBullets = (body: string, heading: string, nextHeading: string): string[] => {
  return extractSectionBody(body, heading, nextHeading)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
};

/**
 * Normalizes one delimited slug-list field.
 */
const normalizeSlugList = (value: string, fieldName: string): string[] => {
  if (value === "none") {
    return [];
  }

  return [...new Set(
    value
      .split(",")
      .map((entry) => ensureSlug(entry, fieldName))
      .filter(Boolean),
  )].sort();
};

/**
 * Normalizes one raw taxonomy registry entry.
 */
const normalizeRegistryEntry = (entry: RawTaxonomyRegistryEntry): TaxonomyRegistryEntry => {
  const normalizedState = entry.state.trim();
  if (!isTaxonomyRegistryEntryState(normalizedState)) {
    throw new Error(`Unsupported taxonomy registry state: ${entry.state}`);
  }

  const normalizedMigration = entry.migration.trim();
  if (!isTaxonomyRegistryMigrationKind(normalizedMigration)) {
    throw new Error(`Unsupported taxonomy registry migration: ${entry.migration}`);
  }

  return {
    scope: ensureSlug(entry.scope, "scope"),
    topic: ensureSlug(entry.topic, "topic"),
    state: normalizedState,
    migration: normalizedMigration,
    aliases: [...new Set(entry.aliases.map((alias) => ensureSlug(alias, "alias")))].sort(),
    mappedScopes: [...new Set(entry.mappedScopes.map((scope) => ensureSlug(scope, "mappedScopes")))].sort(),
  };
};

/**
 * Serializes one normalized registry entry into the canonical-doc guidance line format.
 */
const serializeRegistryEntry = (entry: TaxonomyRegistryEntry): string => {
  const aliases = entry.aliases.length === 0 ? "none" : entry.aliases.join(",");
  const mappedScopes = entry.mappedScopes.length === 0 ? "none" : entry.mappedScopes.join(",");

  return [
    registryEntryPrefix,
    `scope=${entry.scope};`,
    `topic=${entry.topic};`,
    `state=${entry.state};`,
    `migration=${entry.migration};`,
    `aliases=${aliases};`,
    `mapped-scopes=${mappedScopes}`,
  ].join(" ");
};

/**
 * Parses one serialized registry entry from a guidance bullet.
 */
const parseRegistryEntryLine = (line: string): TaxonomyRegistryEntry => {
  const rawEntry = line.startsWith(registryEntryPrefix)
    ? line.slice(registryEntryPrefix.length).trim()
    : line;
  const fields = rawEntry
    .split(";")
    .map((field) => field.trim())
    .filter(Boolean);
  const values = new Map<string, string>();

  for (const field of fields) {
    const separatorIndex = field.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`Invalid taxonomy registry field: ${field}`);
    }

    const key = field.slice(0, separatorIndex).trim();
    const value = field.slice(separatorIndex + 1).trim();
    if (key === "" || value === "") {
      throw new Error(`Invalid taxonomy registry field: ${field}`);
    }

    values.set(key, value);
  }

  const scope = values.get("scope");
  const topic = values.get("topic");
  const state = values.get("state");
  const migration = values.get("migration");
  const aliases = values.get("aliases");
  const mappedScopes = values.get("mapped-scopes");

  if (!scope || !topic || !state || !migration || !aliases || !mappedScopes) {
    throw new Error("Taxonomy registry entry is missing one or more required fields");
  }

  return normalizeRegistryEntry({
    scope,
    topic,
    state,
    migration,
    aliases: normalizeSlugList(aliases, "aliases"),
    mappedScopes: normalizeSlugList(mappedScopes, "mappedScopes"),
  });
};

/**
 * Validates cross-entry invariants before the registry is written.
 */
const validateRegistryEntries = (entries: TaxonomyRegistryEntry[]): TaxonomyRegistryEntry[] => {
  if (entries.length === 0) {
    throw new Error("Taxonomy registry must contain at least one entry");
  }

  const normalizedEntries = entries.map((entry) => normalizeRegistryEntry(entry));
  const entriesByScope = new Map<string, TaxonomyRegistryEntry>();
  const aliasOwners = new Map<string, string>();

  for (const entry of normalizedEntries) {
    const existingAliasOwner = aliasOwners.get(entry.scope);
    if (existingAliasOwner && existingAliasOwner !== entry.scope) {
      throw new Error(`Taxonomy registry scope collides with alias: ${entry.scope}`);
    }

    if (entriesByScope.has(entry.scope)) {
      throw new Error(`Duplicate taxonomy registry scope: ${entry.scope}`);
    }

    entriesByScope.set(entry.scope, entry);

    for (const alias of entry.aliases) {
      if (alias === entry.scope) {
        throw new Error(`Taxonomy registry alias duplicates its scope: ${entry.scope}`);
      }

      const existingScopeOwner = entriesByScope.get(alias);
      if (existingScopeOwner && existingScopeOwner.scope !== entry.scope) {
        throw new Error(`Taxonomy registry alias collides with registered scope: ${alias}`);
      }

      const existingAliasOwnerForAlias = aliasOwners.get(alias);
      if (existingAliasOwnerForAlias && existingAliasOwnerForAlias !== entry.scope) {
        throw new Error(`Taxonomy registry alias collision: ${alias}`);
      }

      aliasOwners.set(alias, entry.scope);
    }
  }

  const reservedEntry = entriesByScope.get(ReservedTaxonomyRegistryScope);
  if (!reservedEntry) {
    throw new Error("Taxonomy registry must declare the reserved taxonomy-registry scope");
  }

  if (
    reservedEntry.topic !== ReservedTaxonomyRegistryTopic
    || reservedEntry.state !== "active"
  ) {
    throw new Error(
      "Reserved taxonomy-registry entry must keep topic and state aligned to the bootstrap contract",
    );
  }

  return [...normalizedEntries].sort((left, right) => left.scope.localeCompare(right.scope));
};

/**
 * Parses normalized registry entries from the reserved canonical doc body.
 */
const parseRegistryEntriesFromBody = (body: string): TaxonomyRegistryEntry[] => {
  const entryLines = extractSectionBullets(body, registrySectionHeading, referencesSectionHeading)
    .filter((line) => line.startsWith(registryEntryPrefix));

  if (entryLines.length === 0) {
    throw new Error("Taxonomy registry guidance must include at least one registry-entry line");
  }

  return validateRegistryEntries(entryLines.map((line) => parseRegistryEntryLine(line)));
};

/**
 * Reads the active reserved taxonomy registry for one project.
 */
export const readActiveTaxonomyRegistry = (
  project: string,
  context = createRepositoryContext(),
): TaxonomyRegistryDocument => {
  const projectSlug = ensureKebabCaseProject(project);
  const relativePath = path.join(
    "projects",
    projectSlug,
    "canonical-docs",
    ReservedTaxonomyRegistryScope,
    `${ReservedTaxonomyRegistryTopic}.md`,
  );
  const document = readDocument(context, relativePath);

  if (document.type !== "canonical-doc") {
    throw new Error("Reserved taxonomy registry path must contain a canonical-doc");
  }

  if (document.metadata.status !== "active") {
    throw new Error("Reserved taxonomy registry document must remain active");
  }

  if (
    document.metadata.registry_scope !== ReservedTaxonomyRegistryScope
    || document.metadata.topic !== ReservedTaxonomyRegistryTopic
  ) {
    throw new Error("Reserved taxonomy registry document metadata is invalid");
  }

  return {
    document,
    entries: parseRegistryEntriesFromBody(document.body),
  };
};

/**
 * Collects parsed canonical docs for one project from the active projects tree.
 */
const collectProjectCanonicalDocs = (
  project: string,
  context: RepositoryContext,
): ParsedDocument[] => {
  const projectSlug = ensureKebabCaseProject(project);

  return listAllActiveDocumentPaths(context)
    .filter((relativePath) => relativePath.startsWith(`projects/${projectSlug}/canonical-docs/`))
    .map((relativePath) => readDocument(context, relativePath))
    .filter((document) => document.type === "canonical-doc");
};

/**
 * Builds one lookup that resolves canonical scopes and alias names to their owning registry entry.
 */
const buildRegistryEntryLookup = (
  entries: TaxonomyRegistryEntry[],
): Map<string, TaxonomyRegistryEntry> => {
  const lookup = new Map<string, TaxonomyRegistryEntry>();

  for (const entry of entries) {
    lookup.set(entry.scope, entry);

    for (const alias of entry.aliases) {
      lookup.set(alias, entry);
    }
  }

  return lookup;
};

/**
 * Resolves one declared registry scope against canonical scope names and alias names.
 */
const resolveRegistryEntry = (
  lookup: Map<string, TaxonomyRegistryEntry>,
  scope: string,
): ResolvedRegistryEntry | undefined => {
  const entry = lookup.get(scope);
  if (!entry) {
    return undefined;
  }

  return {
    entry,
    inputScope: scope,
    usesAlias: scope !== entry.scope,
  };
};

/**
 * Ensures one canonical-doc write satisfies registry-backed taxonomy invariants.
 */
export const assertCanonicalDocWriteAllowed = (
  input: CanonicalDocTaxonomyValidationInput,
  context = createRepositoryContext(),
): void => {
  const projectSlug = ensureKebabCaseProject(input.project);
  const registryScope = ensureSlug(input.registryScope, "registryScope");
  const nextStatus = input.status.trim();

  if (registryScope === ReservedTaxonomyRegistryScope) {
    throw new Error("Use the dedicated taxonomy registry write surface for the reserved registry scope");
  }

  const registry = readActiveTaxonomyRegistry(projectSlug, context);
  const registryEntryLookup = buildRegistryEntryLookup(registry.entries);
  const resolvedEntry = resolveRegistryEntry(registryEntryLookup, registryScope);
  if (!resolvedEntry) {
    throw new Error(`Unknown taxonomy registry scope: ${registryScope}`);
  }
  const entry = resolvedEntry.entry;

  if (nextStatus === "active" && !activeLikeRegistryStates.has(entry.state)) {
    throw new Error(`Retired taxonomy registry scope cannot own an active canonical doc: ${registryScope}`);
  }

  if (nextStatus !== "active") {
    return;
  }

  const candidateRelativePath = resolveDocumentRelativePath(
    projectSlug,
    "canonical-doc",
    input.topic,
    currentDate(),
    { registryScope },
  );
  const conflictingDocument = collectProjectCanonicalDocs(projectSlug, context).find((document) => {
    const documentRegistryScope = document.metadata.registry_scope;
    if (!documentRegistryScope) {
      return false;
    }

    const resolvedDocumentEntry = resolveRegistryEntry(registryEntryLookup, documentRegistryScope);
    if (!resolvedDocumentEntry) {
      return false;
    }

    return (
      document.metadata.status === "active"
      && resolvedDocumentEntry.entry.scope === entry.scope
      && document.relativePath !== candidateRelativePath
    );
  });

  if (conflictingDocument) {
    throw new Error(
      `Active canonical authority already exists for scope ${entry.scope}: ${conflictingDocument.relativePath}`,
    );
  }
};

/**
 * Writes the reserved taxonomy registry canonical doc using normalized entry data.
 */
export const upsertTaxonomyRegistry = (
  input: TaxonomyRegistryInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const project = ensureKebabCaseProject(input.project);
  const metadata: Frontmatter = {
    date: input.date ?? currentDate(),
    project,
    topic: ReservedTaxonomyRegistryTopic,
    registry_scope: ReservedTaxonomyRegistryScope,
    source: input.source ?? "tool",
    status: "active",
  };
  const entries = validateRegistryEntries(input.entries);
  const body = renderTemplate(loadTemplate(context, "canonical-doc.md"), {
    summary: input.summary?.trim()
      ?? `Active taxonomy registry for the ${project} project.`,
    guidance: renderList(entries.map((entry) => serializeRegistryEntry(entry))),
    references: renderList(input.references ?? []),
  });
  const relativePath = resolveDocumentRelativePath(
    project,
    "canonical-doc",
    ReservedTaxonomyRegistryTopic,
    metadata.date,
    { registryScope: ReservedTaxonomyRegistryScope },
  );

  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Builds one taxonomy audit issue record.
 */
const createAuditIssue = (issue: TaxonomyAuditIssue): TaxonomyAuditIssue => {
  return {
    ...issue,
    relativePaths: [...issue.relativePaths].sort(),
  };
};

/**
 * Audits machine-detectable taxonomy consistency for one project.
 */
export const auditTaxonomyConsistency = (
  input: TaxonomyAuditInput,
  context = createRepositoryContext(),
): TaxonomyAuditResult => {
  const project = ensureKebabCaseProject(input.project);
  const registryRelativePath = path.join(
    "projects",
    project,
    "canonical-docs",
    ReservedTaxonomyRegistryScope,
    `${ReservedTaxonomyRegistryTopic}.md`,
  );
  const canonicalDocs = collectProjectCanonicalDocs(project, context);
  const activeCanonicalDocs = canonicalDocs.filter((document) => document.metadata.status === "active");
  const registryDocuments = activeCanonicalDocs.filter((document) => {
    return document.metadata.registry_scope === ReservedTaxonomyRegistryScope;
  });
  const issues: TaxonomyAuditIssue[] = [];

  if (registryDocuments.length === 0) {
    issues.push(
      createAuditIssue({
        code: "missing-registry",
        severity: "error",
        message: "No active reserved taxonomy registry document exists for the project.",
        relativePaths: [registryRelativePath],
      }),
    );
  }

  if (registryDocuments.length > 1) {
    issues.push(
      createAuditIssue({
        code: "duplicate-registry",
        severity: "error",
        message: "Multiple active reserved taxonomy registry documents exist for the project.",
        relativePaths: registryDocuments.map((document) => document.relativePath),
      }),
    );
  }

  let registryEntries: TaxonomyRegistryEntry[] = [];
  try {
    if (registryDocuments.length >= 1) {
      registryEntries = readActiveTaxonomyRegistry(project, context).entries;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown taxonomy registry parse failure";
    issues.push(
      createAuditIssue({
        code: "invalid-registry",
        severity: "error",
        message: `Active taxonomy registry could not be parsed: ${message}`,
        relativePaths: [registryRelativePath],
      }),
    );
  }

  const registryEntryByScope = new Map<string, TaxonomyRegistryEntry>();
  for (const entry of registryEntries) {
    if (registryEntryByScope.has(entry.scope)) {
      issues.push(
        createAuditIssue({
          code: "duplicate-registry-entry",
          severity: "error",
          message: `The taxonomy registry declares duplicate scope entries for ${entry.scope}.`,
          scope: entry.scope,
          relativePaths: [registryRelativePath],
        }),
      );
      continue;
    }

    registryEntryByScope.set(entry.scope, entry);
  }
  const registryEntryLookup = buildRegistryEntryLookup(registryEntries);

  const activeNonRegistryCanonicalDocs = activeCanonicalDocs.filter((document) => {
    return document.metadata.registry_scope !== ReservedTaxonomyRegistryScope;
  });
  const activeDocsByScope = new Map<string, ParsedDocument[]>();

  for (const document of activeNonRegistryCanonicalDocs) {
    const registryScope = document.metadata.registry_scope;
    if (!registryScope) {
      continue;
    }

    const resolvedEntry = resolveRegistryEntry(registryEntryLookup, registryScope);
    if (!resolvedEntry) {
      issues.push(
        createAuditIssue({
          code: "unknown-scope",
          severity: "error",
          message: `Active canonical doc uses unknown taxonomy registry scope ${registryScope}.`,
          scope: registryScope,
          relativePaths: [document.relativePath],
        }),
      );
      continue;
    }

    const ownerScope = resolvedEntry.entry.scope;
    const ownerScopedDocuments = activeDocsByScope.get(ownerScope) ?? [];
    ownerScopedDocuments.push(document);
    activeDocsByScope.set(ownerScope, ownerScopedDocuments);

    if (resolvedEntry.usesAlias) {
      issues.push(
        createAuditIssue({
          code: "alias-scope-usage",
          severity: "warning",
          message: `Active canonical doc uses taxonomy alias ${registryScope} for registered scope ${ownerScope}.`,
          scope: registryScope,
          relativePaths: [document.relativePath, registryRelativePath],
        }),
      );
    }

    if (resolvedEntry.entry.state === "retired") {
      issues.push(
        createAuditIssue({
          code: "retired-scope-usage",
          severity: "error",
          message: `Active canonical doc still targets retired taxonomy registry scope ${ownerScope}.`,
          scope: ownerScope,
          relativePaths: [document.relativePath, registryRelativePath],
        }),
      );
    }
  }

  for (const [scope, scopedDocuments] of activeDocsByScope) {
    if (scopedDocuments.length <= 1) {
      continue;
    }

    issues.push(
      createAuditIssue({
        code: "duplicate-authority",
        severity: "error",
        message: `Multiple active canonical docs claim authority for scope ${scope}.`,
        scope,
        relativePaths: scopedDocuments.map((document) => document.relativePath),
      }),
    );
  }

  const sortedIssues = [...issues].sort((left, right) => {
    if (left.severity !== right.severity) {
      return taxonomyAuditSeverityPriority[left.severity] - taxonomyAuditSeverityPriority[right.severity];
    }

    if (left.code !== right.code) {
      return left.code.localeCompare(right.code);
    }

    return left.relativePaths.join("|").localeCompare(right.relativePaths.join("|"));
  });

  return {
    project,
    registryRelativePath,
    registryEntryCount: registryEntries.length,
    passed: sortedIssues.every((issue) => issue.severity !== "error"),
    issues: sortedIssues,
  };
};
