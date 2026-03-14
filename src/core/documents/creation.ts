import { createRepositoryContext } from "../config/index.ts";
import type {
  CanonicalDocInput,
  DecisionInput,
  Frontmatter,
  ParsedDocument,
  ProviderNoteInput,
  RunbookInput,
  SessionNoteInput,
  VerificationResultInput,
} from "../types/index.ts";
import type {
  ArchiveWorkItemInput,
  CloseWorkItemInput,
  WorkItemDefinition,
  WorkItemDocumentStatus,
  WorkItemInput,
  WorkItemState,
} from "../workItems/index.ts";
import {
  parseWorkItemDocument,
  renderWorkItemBody,
  validateWorkItemDefinition,
} from "../workItems/index.ts";

import { loadTemplate, renderList, renderTemplate } from "./content.ts";
import {
  currentDate,
  ensureKebabCaseProject,
  ensureSlug,
  resolveDocumentRelativePath,
} from "./pathLayout.ts";
import { readDocument, writeDocument } from "./storage.ts";

/**
 * Shared frontmatter inputs accepted by document creation helpers.
 */
type DefaultFrontmatterInput = {
  project: string;
  topic: string;
  date?: string;
  registryScope?: string;
  source?: Frontmatter["source"];
  status?: Frontmatter["status"];
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
  };

  if (input.registryScope) {
    metadata.registry_scope = ensureSlug(input.registryScope, "registryScope");
  }

  return metadata;
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
  const relativePath = resolveDocumentRelativePath(
    metadata.project,
    "session-note",
    metadata.topic,
    metadata.date,
  );
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
  const relativePath = resolveDocumentRelativePath(
    metadata.project,
    "verification-result",
    metadata.topic,
    metadata.date,
  );
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
  const relativePath = resolveDocumentRelativePath(
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
  const relativePath = resolveDocumentRelativePath(
    metadata.project,
    "canonical-doc",
    metadata.topic,
    metadata.date,
    { registryScope: input.registryScope },
  );
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
  const relativePath = resolveDocumentRelativePath(
    metadata.project,
    "decision",
    metadata.topic,
    metadata.date,
  );
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
  const relativePath = resolveDocumentRelativePath(
    metadata.project,
    "runbook",
    metadata.topic,
    metadata.date,
  );
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Creates or updates one managed work-item document.
 */
export const upsertWorkItem = (
  input: WorkItemInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const workItemStatus: WorkItemDocumentStatus = input.status ?? "active";
  const workItemState: WorkItemState = input.workItemState ?? "open";
  const baseMetadata = defaultFrontmatter({
    ...input,
    status: workItemStatus,
  });
  const metadata: Frontmatter = {
    ...baseMetadata,
    work_item_state: workItemState,
  };
  const definition: WorkItemDefinition = {
    metadata: {
      project: metadata.project,
      topic: metadata.topic,
      date: metadata.date,
      status: workItemStatus,
      workItemState,
    },
    summary: input.summary.trim(),
    outcome: input.outcome.trim(),
    origin: input.origin,
    dependencies: input.dependencies,
    context: input.context,
    verification: input.verification,
    evidence: input.evidence,
  };
  const validation = validateWorkItemDefinition(definition);
  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const body = renderWorkItemBody(loadTemplate(context, "work-item.md"), definition);
  const relativePath = resolveDocumentRelativePath(
    metadata.project,
    "work-item",
    metadata.topic,
    metadata.date,
  );
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Closes one existing work-item by applying a terminal lifecycle state.
 */
export const closeWorkItem = (
  input: CloseWorkItemInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const relativePath = resolveDocumentRelativePath(
    input.project,
    "work-item",
    input.topic,
    input.date,
  );
  const existingDocument = readDocument(context, relativePath);
  const existingDefinition = parseWorkItemDocument(existingDocument);
  const currentState = existingDefinition.metadata.workItemState;

  if (existingDefinition.metadata.status === "archived") {
    throw new Error("Archived work items cannot be closed");
  }

  if (currentState === input.state) {
    return existingDocument;
  }

  if (currentState === "done" || currentState === "canceled") {
    throw new Error(`Cannot transition work item from ${currentState} to ${input.state}`);
  }

  return upsertWorkItem(
    {
      project: existingDefinition.metadata.project,
      topic: existingDefinition.metadata.topic,
      date: existingDefinition.metadata.date,
      source: existingDocument.metadata.source,
      status: existingDefinition.metadata.status,
      workItemState: input.state,
      summary: existingDefinition.summary,
      outcome: existingDefinition.outcome,
      origin: existingDefinition.origin,
      dependencies: existingDefinition.dependencies,
      context: existingDefinition.context,
      verification: existingDefinition.verification,
      evidence: existingDefinition.evidence,
    },
    context,
  );
};

/**
 * Archives one existing work-item after it reaches a terminal lifecycle state.
 */
export const archiveWorkItem = (
  input: ArchiveWorkItemInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const relativePath = resolveDocumentRelativePath(
    input.project,
    "work-item",
    input.topic,
    input.date,
  );
  const existingDocument = readDocument(context, relativePath);
  const existingDefinition = parseWorkItemDocument(existingDocument);
  const currentStatus = existingDefinition.metadata.status;
  const currentState = existingDefinition.metadata.workItemState;

  if (currentStatus === "archived") {
    return existingDocument;
  }

  if (currentState !== "done" && currentState !== "canceled") {
    throw new Error(`Only done or canceled work items can be archived; received ${currentState}`);
  }

  return upsertWorkItem(
    {
      project: existingDefinition.metadata.project,
      topic: existingDefinition.metadata.topic,
      date: existingDefinition.metadata.date,
      source: existingDocument.metadata.source,
      status: "archived",
      workItemState: currentState,
      summary: existingDefinition.summary,
      outcome: existingDefinition.outcome,
      origin: existingDefinition.origin,
      dependencies: existingDefinition.dependencies,
      context: existingDefinition.context,
      verification: existingDefinition.verification,
      evidence: existingDefinition.evidence,
    },
    context,
  );
};
