import fs from "node:fs";
import path from "node:path";

import { createRepositoryContext } from "../config/index.ts";
import { isDocumentSource, isDocumentStatus, isDocumentType } from "../types/index.ts";
import { validateBody, validateFrontmatter } from "../validation/index.ts";
import type {
  CanonicalDocInput,
  DecisionInput,
  DocumentType,
  Frontmatter,
  ParsedDocument,
  ProviderNoteInput,
  RepositoryContext,
  RunbookInput,
  SessionNoteInput,
  VerificationResultInput,
} from "../types/index.ts";

type RenderData = Record<string, string>;

type ParsedFrontmatter = {
  metadata: Record<string, string>;
  body: string;
};

type DefaultFrontmatterInput = {
  project: string;
  topic: string;
  date?: string;
  registryScope?: string;
  source?: Frontmatter["source"];
  status?: Frontmatter["status"];
  projectCommit?: string;
};

type DocumentPathPattern = {
  type: DocumentType;
  archived: boolean;
  pattern: RegExp;
};

const slug = '[a-z0-9]+(?:-[a-z0-9]+)*';
const year = '\\d{4}';
const month = '\\d{2}';
const date = '\\d{4}-\\d{2}-\\d{2}';

const docPattern = (root: string, rest: string): RegExp =>
  new RegExp(`^${root}\\/${slug}\\/${rest}\\.md$`);

const documentPathPatterns: DocumentPathPattern[] = [
  {
    type: "session-note",
    archived: false,
    pattern: docPattern("projects", `session-log\\/${year}\\/${month}\\/${date}-${slug}`),
  },
  {
    type: "verification-result",
    archived: false,
    pattern: docPattern("projects", `verification\\/${year}\\/${date}-${slug}`),
  },
  {
    type: "provider-note",
    archived: false,
    pattern: docPattern("projects", `provider-notes\\/${slug}`),
  },
  {
    type: "decision",
    archived: false,
    pattern: docPattern("projects", `decisions\\/${year}\\/${date}-${slug}`),
  },
  {
    type: "runbook",
    archived: false,
    pattern: docPattern("projects", `runbooks\\/${slug}`),
  },
  {
    type: "canonical-doc",
    archived: false,
    pattern: docPattern("projects", `canonical-docs\\/${slug}\\/${slug}`),
  },
  {
    type: "session-note",
    archived: true,
    pattern: docPattern("archives", `session-log\\/${year}\\/${month}\\/${date}-${slug}`),
  },
  {
    type: "verification-result",
    archived: true,
    pattern: docPattern("archives", `verification\\/${year}\\/${date}-${slug}`),
  },
];

/**
 * Converts an arbitrary label into a filesystem-safe slug.
 */
const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};

/**
 * Normalizes one slug-like label and rejects empty results.
 */
const ensureSlug = (value: string, fieldName: string): string => {
  const normalized = slugify(value);
  if (!normalized) {
    throw new Error(`${fieldName} must not be empty`);
  }

  return normalized;
};

/**
 * Normalizes and validates a project slug candidate.
 */
const ensureKebabCaseProject = (project: string): string => {
  return ensureSlug(project, "Project");
};

/**
 * Converts a repository-relative path to POSIX separators.
 */
const normalizeRelativePath = (relativePath: string): string => {
  return relativePath.split(path.sep).join("/");
};

/**
 * Matches one repository-relative path against the managed document layout.
 */
const matchDocumentPath = (relativePath: string): DocumentPathPattern | undefined => {
  const normalized = normalizeRelativePath(relativePath);
  return documentPathPatterns.find(({ pattern }) => pattern.test(normalized));
};

/**
 * Returns the current UTC date formatted as `YYYY-MM-DD`.
 */
const currentDate = (): string => {
  return new Date().toISOString().slice(0, 10);
};

/**
 * Renders a Markdown bullet list.
 */
const renderList = (items: string[]): string => {
  return items.length === 0 ? "- none" : items.map((item) => `- ${item}`).join("\n");
};

/**
 * Loads a document template from the repository template directory.
 */
const loadTemplate = (context: RepositoryContext, templateName: string): string => {
  const templatePath = path.join(context.templatesDir, templateName);
  return fs.readFileSync(templatePath, "utf8");
};

/**
 * Replaces `{{placeholder}}` tokens in a template with string values.
 */
const renderTemplate = (template: string, data: RenderData): string => {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => data[key] ?? "");
};

/**
 * Serializes validated frontmatter into a Markdown header block.
 */
const buildFrontmatter = (frontmatter: Frontmatter): string => {
  const lines = [
    "---",
    `date: ${frontmatter.date}`,
    `project: ${frontmatter.project}`,
    `topic: ${frontmatter.topic}`,
  ];

  if (frontmatter.registry_scope) {
    lines.push(`registry_scope: ${frontmatter.registry_scope}`);
  }

  lines.push(`source: ${frontmatter.source}`, `status: ${frontmatter.status}`);

  if (frontmatter.project_commit) {
    lines.push(`project_commit: ${frontmatter.project_commit}`);
  }

  lines.push("---", "");
  return lines.join("\n");
};

/**
 * Parses a Markdown document into raw frontmatter and body strings.
 */
const parseFrontmatter = (raw: string): ParsedFrontmatter => {
  if (!raw.startsWith("---\n")) {
    throw new Error("Document is missing YAML frontmatter");
  }

  const closingIndex = raw.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    throw new Error("Document frontmatter is not closed");
  }

  const header = raw.slice(4, closingIndex);
  const body = raw.slice(closingIndex + 5);
  const metadata: Record<string, string> = {};

  for (const line of header.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    metadata[key] = value;
  }

  return { metadata, body: body.trimStart() };
};

/**
 * Resolves the repository-relative path for a document kind.
 */
const relativePathForType = (
  project: string,
  type: DocumentType,
  topic: string,
  date: string,
  options: {
    provider?: string;
    registryScope?: string;
  } = {},
): string => {
  const [year, month] = date.split("-");
  const topicSlug = ensureSlug(topic, "Topic");

  switch (type) {
    case "session-note":
      return path.join("projects", project, "session-log", year, month, `${date}-${topicSlug}.md`);
    case "verification-result":
      return path.join("projects", project, "verification", year, `${date}-${topicSlug}.md`);
    case "provider-note":
      return path.join(
        "projects",
        project,
        "provider-notes",
        `${ensureSlug(options.provider ?? topic, "Provider")}.md`,
      );
    case "decision":
      return path.join("projects", project, "decisions", year, `${date}-${topicSlug}.md`);
    case "runbook":
      return path.join("projects", project, "runbooks", `${topicSlug}.md`);
    case "canonical-doc":
      return path.join(
        "projects",
        project,
        "canonical-docs",
        ensureSlug(options.registryScope ?? "", "registryScope"),
        `${topicSlug}.md`,
      );
  }
};

/**
 * Infers the document kind from a stored repository-relative path.
 */
export const resolveDocumentTypeFromRelativePath = (relativePath: string): DocumentType => {
  const matchedPath = matchDocumentPath(relativePath);
  if (!matchedPath) {
    throw new Error(`Unsupported document path: ${relativePath}`);
  }

  return matchedPath.type;
};

/**
 * Returns `true` when the path points to one supported active document.
 */
export const isActiveDocumentRelativePath = (relativePath: string): boolean => {
  const matchedPath = matchDocumentPath(relativePath);
  return matchedPath !== undefined && !matchedPath.archived;
};

/**
 * Returns `true` when the path points to one supported managed document.
 */
export const isManagedDocumentRelativePath = (relativePath: string): boolean => {
  return matchDocumentPath(relativePath) !== undefined;
};

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

  if (metadata.project_commit) {
    normalized.project_commit = metadata.project_commit;
  }

  return normalized;
};

/**
 * Validates and writes one Markdown document to disk.
 */
const writeDocument = (
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
 * Applies shared frontmatter defaults for document creation commands.
 */
const defaultFrontmatter = (input: DefaultFrontmatterInput): Frontmatter => {
  const metadata: Frontmatter = {
    date: input.date ?? currentDate(),
    project: ensureKebabCaseProject(input.project),
    topic: ensureSlug(input.topic, "Topic"),
    source: input.source ?? "agent",
    status: input.status ?? "active",
    project_commit: input.projectCommit,
  };

  if (input.registryScope) {
    metadata.registry_scope = ensureSlug(input.registryScope, "registryScope");
  }

  return metadata;
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

  return {
    path: absolutePath,
    relativePath,
    type,
    metadata: normalizeFrontmatter(metadata),
    body,
  };
};

/**
 * Appends a session note document under the active project tree.
 */
export const appendSessionNote = (
  input: SessionNoteInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const metadata = defaultFrontmatter(input);
  const body = renderTemplate(loadTemplate(context, "session-note.md"), {
    summary: input.summary.trim(),
    actions: renderList(input.actions),
    follow_up: renderList(input.followUp),
  });
  const relativePath = relativePathForType(metadata.project, "session-note", metadata.topic, metadata.date);
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Records a verification result under the active project tree.
 */
export const recordVerificationResult = (
  input: VerificationResultInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const metadata = defaultFrontmatter(input);
  const body = renderTemplate(loadTemplate(context, "verification-result.md"), {
    scope: input.scope.trim(),
    steps: renderList(input.steps),
    result: input.result.trim(),
  });
  const relativePath = relativePathForType(metadata.project, "verification-result", metadata.topic, metadata.date);
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Rewrites the managed provider note for one provider.
 */
export const upsertProviderNote = (
  input: ProviderNoteInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const metadata = defaultFrontmatter({
    ...input,
    topic: input.provider,
  });
  const body = renderTemplate(loadTemplate(context, "provider-note.md"), {
    overview: input.overview.trim(),
    constraints: renderList(input.constraints),
    guidance: renderList(input.guidance),
  });
  const relativePath = relativePathForType(
    metadata.project,
    "provider-note",
    metadata.topic,
    metadata.date,
    { provider: input.provider },
  );
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Creates or replaces one canonical doc tied to a declared taxonomy-registry scope.
 */
export const upsertCanonicalDoc = (
  input: CanonicalDocInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const metadata = defaultFrontmatter({
    ...input,
    registryScope: input.registryScope,
  });
  const body = renderTemplate(loadTemplate(context, "canonical-doc.md"), {
    summary: input.summary.trim(),
    guidance: renderList(input.guidance),
    references: renderList(input.references),
  });
  const relativePath = relativePathForType(metadata.project, "canonical-doc", metadata.topic, metadata.date, {
    registryScope: input.registryScope,
  });
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Creates an immutable decision record.
 */
export const createDecision = (
  input: DecisionInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const metadata = defaultFrontmatter(input);
  const body = renderTemplate(loadTemplate(context, "decision.md"), {
    context: input.context.trim(),
    decision: input.decision.trim(),
    consequences: renderList(input.consequences),
  });
  const relativePath = relativePathForType(metadata.project, "decision", metadata.topic, metadata.date);
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Creates or replaces a runbook document.
 */
export const createRunbook = (
  input: RunbookInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const metadata = defaultFrontmatter(input);
  const body = renderTemplate(loadTemplate(context, "runbook.md"), {
    purpose: input.purpose.trim(),
    procedure: renderList(input.procedure),
    verification: renderList(input.verification),
  });
  const relativePath = relativePathForType(metadata.project, "runbook", metadata.topic, metadata.date);
  return writeDocument(context, relativePath, metadata, body);
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

/**
 * Resolves the repository-relative path for a document.
 */
export const resolveDocumentRelativePath = (
  project: string,
  type: DocumentType,
  topic: string,
  date = currentDate(),
  options: {
    provider?: string;
    registryScope?: string;
  } = {},
): string => {
  if (!isDocumentType(type)) {
    throw new Error(`Unsupported document type: ${String(type)}`);
  }

  return relativePathForType(ensureKebabCaseProject(project), type, topic, date, options);
};
