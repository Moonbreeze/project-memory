import { createRepositoryContext } from "../config/index.ts";
import { assertCanonicalDocWriteAllowed } from "../taxonomy/index.ts";
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
import { resolveRecordedAtForWrite } from "./timeline.ts";
import { readDocument, writeDocument } from "./storage.ts";

/**
 * Shared frontmatter inputs accepted by document creation helpers.
 */
type DefaultFrontmatterInput = {
  project: string;
  topic: string;
  date?: string;
  recordedAt?: string;
  registryScope?: string;
  source?: Frontmatter["source"];
  status?: Frontmatter["status"];
};

/**
 * Applies shared frontmatter defaults for document creation commands.
 */
const defaultFrontmatter = (input: DefaultFrontmatterInput): Frontmatter => {
  return {
    date: input.date ?? currentDate(),
    project: ensureKebabCaseProject(input.project),
    topic: ensureSlug(input.topic, "Topic"),
    source: input.source ?? "agent",
    status: input.status ?? "active",
    ...(input.registryScope
      ? { registry_scope: ensureSlug(input.registryScope, "registryScope") }
      : {}),
  };
};

/**
 * Applies the managed timeline key for one document write.
 */
const withRecordedAt = (
  metadata: Frontmatter,
  relativePath: string,
  input: DefaultFrontmatterInput,
  context: ReturnType<typeof createRepositoryContext>,
): Frontmatter => {
  return {
    ...metadata,
    recorded_at: resolveRecordedAtForWrite({
      context,
      relativePath,
      date: metadata.date,
      recordedAt: input.recordedAt,
      preferCurrentTime: input.date === undefined,
    }),
  };
};

/**
 * Appends a session note document under the active project tree.
 */
export const appendSessionNote = (
  input: SessionNoteInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const baseMetadata = defaultFrontmatter(input);
  const relativePath = resolveDocumentRelativePath(
    baseMetadata.project,
    "session-note",
    baseMetadata.topic,
    baseMetadata.date,
  );
  const metadata = withRecordedAt(baseMetadata, relativePath, input, context);
  const body = renderTemplate(loadTemplate(context, "session-note.md"), {
    summary: input.summary.trim(),
    actions: renderList(input.actions),
    follow_up: renderList(input.followUp),
  });
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Records a verification result under the active project tree.
 */
export const recordVerificationResult = (
  input: VerificationResultInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const baseMetadata = defaultFrontmatter(input);
  const relativePath = resolveDocumentRelativePath(
    baseMetadata.project,
    "verification-result",
    baseMetadata.topic,
    baseMetadata.date,
  );
  const metadata = withRecordedAt(baseMetadata, relativePath, input, context);
  const body = renderTemplate(loadTemplate(context, "verification-result.md"), {
    scope: input.scope.trim(),
    steps: renderList(input.steps),
    result: input.result.trim(),
  });
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Rewrites the managed provider note for one provider.
 */
export const upsertProviderNote = (
  input: ProviderNoteInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const baseMetadata = defaultFrontmatter({
    ...input,
    topic: input.provider,
  });
  const relativePath = resolveDocumentRelativePath(
    baseMetadata.project,
    "provider-note",
    baseMetadata.topic,
    baseMetadata.date,
    { provider: input.provider },
  );
  const metadata = withRecordedAt(baseMetadata, relativePath, input, context);
  const body = renderTemplate(loadTemplate(context, "provider-note.md"), {
    overview: input.overview.trim(),
    constraints: renderList(input.constraints),
    guidance: renderList(input.guidance),
  });
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Creates or replaces one canonical doc tied to a declared taxonomy-registry scope.
 */
export const upsertCanonicalDoc = (
  input: CanonicalDocInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const baseMetadata = defaultFrontmatter({
    ...input,
    registryScope: input.registryScope,
  });
  assertCanonicalDocWriteAllowed(
    {
      project: baseMetadata.project,
      topic: baseMetadata.topic,
      registryScope: input.registryScope,
      status: baseMetadata.status,
    },
    context,
  );
  const relativePath = resolveDocumentRelativePath(
    baseMetadata.project,
    "canonical-doc",
    baseMetadata.topic,
    baseMetadata.date,
    { registryScope: input.registryScope },
  );
  const metadata = withRecordedAt(baseMetadata, relativePath, input, context);
  const body = renderTemplate(loadTemplate(context, "canonical-doc.md"), {
    summary: input.summary.trim(),
    guidance: renderList(input.guidance),
    references: renderList(input.references),
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
  const baseMetadata = defaultFrontmatter(input);
  const relativePath = resolveDocumentRelativePath(
    baseMetadata.project,
    "decision",
    baseMetadata.topic,
    baseMetadata.date,
  );
  const metadata = withRecordedAt(baseMetadata, relativePath, input, context);
  const body = renderTemplate(loadTemplate(context, "decision.md"), {
    context: input.context.trim(),
    decision: input.decision.trim(),
    consequences: renderList(input.consequences),
  });
  return writeDocument(context, relativePath, metadata, body);
};

/**
 * Creates or replaces a runbook document.
 */
export const createRunbook = (
  input: RunbookInput,
  context = createRepositoryContext(),
): ParsedDocument => {
  const baseMetadata = defaultFrontmatter(input);
  const relativePath = resolveDocumentRelativePath(
    baseMetadata.project,
    "runbook",
    baseMetadata.topic,
    baseMetadata.date,
  );
  const metadata = withRecordedAt(baseMetadata, relativePath, input, context);
  const body = renderTemplate(loadTemplate(context, "runbook.md"), {
    purpose: input.purpose.trim(),
    procedure: renderList(input.procedure),
    verification: renderList(input.verification),
  });
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
  const initialMetadata = defaultFrontmatter({
    ...input,
    status: workItemStatus,
  });
  const relativePath = resolveDocumentRelativePath(
    initialMetadata.project,
    "work-item",
    initialMetadata.topic,
    initialMetadata.date,
  );
  const baseMetadata = withRecordedAt(initialMetadata, relativePath, input, context);
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
