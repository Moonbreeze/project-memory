import fs from "node:fs";
import path from "node:path";

import { createRepositoryContext } from "../config/index.ts";
import { ensureKebabCaseProject, ensureSlug, readDocument } from "../documents/index.ts";
import {
  buildWorkItemPlanningEntries,
  resolveWorkItemLocatorRelativePath,
} from "../workItems/index.ts";
import type {
  BoundedReadDependencySurface,
  BoundedReadPlanningExplainability,
  BoundedReadEntrypoint,
  BoundedReadResult,
  BoundedReadStage,
  BoundedReadStrategy,
  ColdStartInput,
  DocumentStatus,
  DocumentType,
  PlanningBacklogInput,
  PlanningTopicEntryInput,
  ParsedDocument,
  RationaleEntryInput,
  RepositoryContext,
  TopicEntryInput,
} from "../types/index.ts";
import type {
  WorkItemPlanningEntry,
  WorkItemPlanningState,
} from "../workItems/index.ts";

type PathMatchMode = "all" | "exact" | "contains";

type DatedDirectoryShape = "flat" | "year-month";

/**
 * Selected documents returned from one bounded-read stage.
 */
type StageDocuments = {
  documents: ParsedDocument[];
  relativePaths: string[];
};

/**
 * Internal configuration for one bounded-read stage.
 *
 * Runtime selection behavior is determined by the precomputed `candidatePaths`
 * and status filters. `strategy` is reporting-only metadata that is copied into
 * the result so callers can see which bounded selection rule produced the stage.
 */
type StageInput = {
  name: string;
  documentType: DocumentType;
  /** Reporting-only selection label surfaced in the returned stage metadata. */
  strategy: BoundedReadStrategy;
  limit: number;
  description: string;
  candidatePaths: string[];
  allowedStatuses: DocumentStatus[];
};

const currentStatuses: DocumentStatus[] = ["active", "draft"];
const activeStatuses: DocumentStatus[] = ["active"];
const rationaleDecisionStatuses: DocumentStatus[] = ["active", "draft", "superseded"];

const coldStartLimits = {
  runbooks: 2,
  canonicalDocs: 3,
  decisions: 3,
} as const;

const planningBacklogLimits = {
  ready: 4,
  inProgress: 2,
  blocked: 2,
} as const;

const planningTopicEntryLimits = {
  workItems: 4,
  canonicalDocs: 2,
  decisions: 2,
  sessionNotes: 1,
} as const;

const topicEntryLimits = {
  canonicalDocs: 3,
  runbooks: 1,
  providerNotes: 1,
  decisions: 2,
  sessionNotes: 1,
  verificationResults: 1,
  fallbackCanonicalDocs: 2,
  fallbackRunbooks: 1,
  fallbackProviderNotes: 1,
  fallbackDecisions: 2,
} as const;

const rationaleEntryLimits = {
  canonicalDocs: 2,
  referencedDecisions: 2,
  referencedRunbooks: 1,
  exactDecisions: 2,
  exactRunbooks: 1,
  exactProviderNotes: 1,
  sessionNotes: 1,
  verificationResults: 1,
  fallbackCanonicalDocs: 2,
  fallbackDecisions: 2,
  fallbackRunbooks: 1,
} as const;

/**
 * Returns a bounded candidate-window size used before status filtering.
 */
const candidateLimitForStage = (limit: number): number => {
  return limit * 4;
};

/**
 * Returns `true` when the candidate path exists on disk.
 */
const hasFile = (absolutePath: string): boolean => {
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
};

/**
 * Returns sorted directory entries for one absolute directory path.
 */
const readSortedEntries = (
  absoluteDir: string,
  order: "asc" | "desc" = "asc",
): fs.Dirent[] => {
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  return fs
    .readdirSync(absoluteDir, { withFileTypes: true })
    .sort((left, right) =>
      order === "asc"
        ? left.name.localeCompare(right.name)
        : right.name.localeCompare(left.name),
    );
};

/**
 * Collects bounded candidate paths from a single-level topic directory.
 */
const collectFlatTopicPaths = (
  context: RepositoryContext,
  project: string,
  directoryName: "runbooks" | "provider-notes",
  topic: string,
  limit: number,
  matchMode: PathMatchMode,
): string[] => {
  const absoluteDir = path.join(context.projectsDir, project, directoryName);
  const relativeDir = path.join("projects", project, directoryName);

  if (matchMode === "exact") {
    const relativePath = path.join(relativeDir, `${topic}.md`);
    return hasFile(path.join(context.memoryRootDir, relativePath)) ? [relativePath] : [];
  }

  const matches: string[] = [];
  for (const entry of readSortedEntries(absoluteDir)) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const topicSlug = entry.name.slice(0, -3);
    if (matchMode === "contains" && !topicSlug.includes(topic)) {
      continue;
    }

    matches.push(path.join(relativeDir, entry.name));
    if (matches.length === limit) {
      break;
    }
  }

  return matches;
};

/**
 * Collects bounded canonical-doc candidates using scope directories.
 */
const collectCanonicalDocPaths = (
  context: RepositoryContext,
  project: string,
  topic: string,
  limit: number,
  matchMode: PathMatchMode,
): string[] => {
  const absoluteRoot = path.join(context.projectsDir, project, "canonical-docs");
  const relativeRoot = path.join("projects", project, "canonical-docs");
  const matches: string[] = [];

  for (const scopeEntry of readSortedEntries(absoluteRoot)) {
    if (!scopeEntry.isDirectory()) {
      continue;
    }

    const absoluteScopeDir = path.join(absoluteRoot, scopeEntry.name);
    const relativeScopeDir = path.join(relativeRoot, scopeEntry.name);

    if (matchMode === "exact") {
      const relativePath = path.join(relativeScopeDir, `${topic}.md`);
      if (hasFile(path.join(context.memoryRootDir, relativePath))) {
        matches.push(relativePath);
      }
    } else {
      for (const fileEntry of readSortedEntries(absoluteScopeDir)) {
        if (!fileEntry.isFile() || !fileEntry.name.endsWith(".md")) {
          continue;
        }

        const topicSlug = fileEntry.name.slice(0, -3);
        if (matchMode === "contains" && !topicSlug.includes(topic)) {
          continue;
        }

        matches.push(path.join(relativeScopeDir, fileEntry.name));
        if (matches.length === limit) {
          return matches;
        }
      }
    }

    if (matches.length === limit) {
      return matches;
    }
  }

  return matches;
};

/**
 * Collects bounded candidates from dated document directories.
 */
const collectDatedTopicPaths = (
  context: RepositoryContext,
  project: string,
  directoryName: "decisions" | "verification" | "session-log",
  topic: string,
  limit: number,
  matchMode: PathMatchMode,
  shape: DatedDirectoryShape,
): string[] => {
  const absoluteRoot = path.join(context.projectsDir, project, directoryName);
  const relativeRoot = path.join("projects", project, directoryName);
  const matches: string[] = [];

  const pushMatch = (relativePath: string): boolean => {
    matches.push(relativePath);
    return matches.length === limit;
  };

  const processFileEntries = (absoluteDir: string, relativeDir: string): boolean => {
    for (const fileEntry of readSortedEntries(absoluteDir, "desc")) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(".md")) {
        continue;
      }

      const topicSlug = fileEntry.name.replace(/^\d{4}-\d{2}-\d{2}-/, "").slice(0, -3);
      if (matchMode === "exact" && topicSlug !== topic) {
        continue;
      }

      if (matchMode === "contains" && !topicSlug.includes(topic)) {
        continue;
      }

      if (pushMatch(path.join(relativeDir, fileEntry.name))) {
        return true;
      }
    }

    return false;
  };

  for (const yearEntry of readSortedEntries(absoluteRoot, "desc")) {
    if (!yearEntry.isDirectory()) {
      continue;
    }

    const absoluteYearDir = path.join(absoluteRoot, yearEntry.name);
    const relativeYearDir = path.join(relativeRoot, yearEntry.name);

    if (shape === "flat") {
      if (processFileEntries(absoluteYearDir, relativeYearDir)) {
        return matches;
      }

      continue;
    }

    for (const monthEntry of readSortedEntries(absoluteYearDir, "desc")) {
      if (!monthEntry.isDirectory()) {
        continue;
      }

      const absoluteMonthDir = path.join(absoluteYearDir, monthEntry.name);
      const relativeMonthDir = path.join(relativeYearDir, monthEntry.name);
      if (processFileEntries(absoluteMonthDir, relativeMonthDir)) {
        return matches;
      }
    }
  }

  return matches;
};

/**
 * Collects all dated work-item paths for one project in newest-first path order.
 */
const collectProjectWorkItemPaths = (
  context: RepositoryContext,
  project: string,
): string[] => {
  const absoluteRoot = path.join(context.projectsDir, project, "work-items");
  const relativeRoot = path.join("projects", project, "work-items");
  const matches: string[] = [];

  for (const yearEntry of readSortedEntries(absoluteRoot, "desc")) {
    if (!yearEntry.isDirectory()) {
      continue;
    }

    const absoluteYearDir = path.join(absoluteRoot, yearEntry.name);
    const relativeYearDir = path.join(relativeRoot, yearEntry.name);
    for (const fileEntry of readSortedEntries(absoluteYearDir, "desc")) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(".md")) {
        continue;
      }

      matches.push(path.join(relativeYearDir, fileEntry.name));
    }
  }

  return matches;
};

/**
 * Reads selected candidate paths with dedupe and status filtering.
 */
const readStageDocuments = (
  input: StageInput,
  context: RepositoryContext,
  seenRelativePaths: Set<string>,
): StageDocuments => {
  const documents: ParsedDocument[] = [];
  const relativePaths: string[] = [];

  for (const candidatePath of input.candidatePaths) {
    if (seenRelativePaths.has(candidatePath)) {
      continue;
    }

    const document = readDocument(context, candidatePath);
    if (!input.allowedStatuses.includes(document.metadata.status)) {
      continue;
    }

    seenRelativePaths.add(candidatePath);
    documents.push(document);
    relativePaths.push(candidatePath);

    if (documents.length === input.limit) {
      break;
    }
  }

  return { documents, relativePaths };
};

/**
 * Extracts topic references from a canonical-doc references section.
 */
const collectReferenceTopics = (
  document: ParsedDocument,
  prefix: "decision" | "runbook",
): string[] => {
  const lines = document.body.split("\n");
  const topics: string[] = [];
  let inReferences = false;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      inReferences = line.trim() === "## References";
      continue;
    }

    if (!inReferences) {
      continue;
    }

    const match = line.match(new RegExp(`^\\s*-\\s*${prefix}:\\s*(.+?)\\s*$`));
    if (!match) {
      continue;
    }

    try {
      topics.push(ensureSlug(match[1], `${prefix} reference`));
    } catch {
      continue;
    }
  }

  return [...new Set(topics)];
};

/**
 * Creates one stage result and appends selected documents in order.
 *
 * Selection logic comes from the candidate list prepared upstream; this helper
 * only applies dedupe, status filtering, and result shaping.
 */
const appendStage = (
  stages: BoundedReadStage[],
  documents: ParsedDocument[],
  seenRelativePaths: Set<string>,
  input: StageInput,
  context: RepositoryContext,
): ParsedDocument[] => {
  const selected = readStageDocuments(input, context, seenRelativePaths);

  stages.push({
    name: input.name,
    documentType: input.documentType,
    strategy: input.strategy,
    limit: input.limit,
    description: input.description,
    relativePaths: selected.relativePaths,
  });

  documents.push(...selected.documents);
  return selected.documents;
};

/**
 * Finalizes one bounded-read result.
 */
const createBoundedReadResult = (
  entrypoint: BoundedReadEntrypoint,
  project: string,
  stages: BoundedReadStage[],
  documents: ParsedDocument[],
  notes: string[],
  topic?: string,
  planningExplainability?: BoundedReadPlanningExplainability[],
): BoundedReadResult => {
  return {
    entrypoint,
    project,
    topic,
    documents,
    stages,
    planningExplainability,
    notes,
  };
};

/**
 * Reads all active work-item planning entries for one project.
 */
const listProjectWorkItemPlanningEntries = (
  context: RepositoryContext,
  project: string,
) => {
  const workItemDocuments = collectProjectWorkItemPaths(context, project)
    .map((relativePath) => readDocument(context, relativePath))
    .filter((document) => {
      return document.type === "work-item" && document.metadata.status === "active";
    });

  return buildWorkItemPlanningEntries(workItemDocuments);
};

/**
 * Returns planning entries in stable planning rank order.
 */
const sortPlanningEntries = (
  entries: WorkItemPlanningEntry[],
): WorkItemPlanningEntry[] => {
  const planningPriority: Record<WorkItemPlanningState, number> = {
    ready: 0,
    in_progress: 1,
    blocked: 2,
    done: 3,
    canceled: 4,
    draft: 5,
    archived: 6,
  };

  return [...entries].sort((left, right) => {
    const priorityDifference =
      planningPriority[left.planning.planningState] - planningPriority[right.planning.planningState];
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const dateDifference = right.document.metadata.date.localeCompare(left.document.metadata.date);
    if (dateDifference !== 0) {
      return dateDifference;
    }

    return left.document.relativePath.localeCompare(right.document.relativePath);
  });
};

/**
 * Returns `true` when a planning state belongs to the backlog read surface.
 */
const isPlanningBacklogState = (planningState: string): boolean => {
  return planningState === "ready" || planningState === "in_progress" || planningState === "blocked";
};

/**
 * Returns planning entries sorted the same way as the active work-item backlog.
 */
const listPlanningBacklogEntries = (
  entries: WorkItemPlanningEntry[],
): WorkItemPlanningEntry[] => {
  return sortPlanningEntries(entries).filter((entry) => {
    return isPlanningBacklogState(entry.planning.planningState);
  });
};

const collectPlanningContextCandidatePaths = (
  context: RepositoryContext,
  project: string,
  entries: WorkItemPlanningEntry[],
  locatorType: "canonical-doc" | "decision" | "session-note",
): string[] => {
  const seenRelativePaths = new Set<string>();
  const relativePaths: string[] = [];

  for (const entry of entries) {
    for (const locator of entry.definition.context) {
      if (locator.type !== locatorType || locator.project !== project) {
        continue;
      }

      const relativePath = resolveWorkItemLocatorRelativePath(locator);
      if (
        seenRelativePaths.has(relativePath)
        || !hasFile(path.join(context.memoryRootDir, relativePath))
      ) {
        continue;
      }

      seenRelativePaths.add(relativePath);
      relativePaths.push(relativePath);
    }
  }

  return relativePaths;
};

/**
 * Builds bounded planning explainability for the selected planning documents.
 */
const buildPlanningExplainability = (
  allEntries: WorkItemPlanningEntry[],
  selectedDocuments: ParsedDocument[],
): BoundedReadPlanningExplainability[] => {
  const entryByPath = new Map(
    allEntries.map((entry) => [entry.document.relativePath, entry] as const),
  );

  return selectedDocuments.map((document) => {
    const entry = entryByPath.get(document.relativePath);
    if (!entry) {
      throw new Error(`Missing planning entry for ${document.relativePath}`);
    }

    const dependencySurfaces: BoundedReadDependencySurface[] = entry.definition.dependencies.map((dependency) => {
      const dependencyRelativePath = resolveWorkItemLocatorRelativePath(dependency);
      const dependencyEntry = entryByPath.get(dependencyRelativePath);

      return {
        relativePath: dependencyRelativePath,
        resolved: dependencyEntry?.definition.metadata.workItemState === "done",
      };
    });

    return {
      relativePath: entry.document.relativePath,
      planningState: entry.planning.planningState,
      dependencyCount: entry.planning.dependencyCount,
      unresolvedDependencyCount: entry.planning.unresolvedDependencyCount,
      dependencySurfaces,
    };
  });
};

/**
 * Reads a bounded cold-start snapshot for one project.
 */
export const readColdStart = (
  input: ColdStartInput,
  context = createRepositoryContext(),
): BoundedReadResult => {
  const project = ensureKebabCaseProject(input.project);
  const stages: BoundedReadStage[] = [];
  const documents: ParsedDocument[] = [];
  const notes = [
    "Cold start reads only bounded runbook, canonical-doc, and decision sources.",
    "Cold start still omits work-item sources; use planning-backlog reads for bounded planning context.",
  ];
  const seenRelativePaths = new Set<string>();

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "runbook-bootstrap",
      documentType: "runbook",
      strategy: "path-ordered",
      limit: coldStartLimits.runbooks,
      description: "Read the first bounded runbooks by path for project-level operating context.",
      candidatePaths: collectFlatTopicPaths(
        context,
        project,
        "runbooks",
        "",
        candidateLimitForStage(coldStartLimits.runbooks),
        "all",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "canonical-current-truth",
      documentType: "canonical-doc",
      strategy: "path-ordered",
      limit: coldStartLimits.canonicalDocs,
      description: "Read the first bounded canonical docs by scope/path for current authoritative context.",
      candidatePaths: collectCanonicalDocPaths(
        context,
        project,
        "",
        candidateLimitForStage(coldStartLimits.canonicalDocs),
        "all",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "decision-recent",
      documentType: "decision",
      strategy: "path-ordered",
      limit: coldStartLimits.decisions,
      description: "Read the newest bounded active-or-draft decisions by dated path.",
      candidatePaths: collectDatedTopicPaths(
        context,
        project,
        "decisions",
        "",
        candidateLimitForStage(coldStartLimits.decisions),
        "all",
        "flat",
      ),
      allowedStatuses: currentStatuses,
    },
    context,
  );

  if (documents.length === 0) {
    notes.push("No bounded cold-start sources were found for this project.");
  }

  return createBoundedReadResult("cold-start", project, stages, documents, notes);
};

/**
 * Reads a bounded planning backlog package for one project work-item backlog.
 */
export const readPlanningBacklog = (
  input: PlanningBacklogInput,
  context = createRepositoryContext(),
): BoundedReadResult => {
  const project = ensureKebabCaseProject(input.project);
  const stages: BoundedReadStage[] = [];
  const documents: ParsedDocument[] = [];
  const notes = [
    "Planning backlog reads only same-project active work-item documents and never falls back to decision backlog behavior.",
    "Planning backlog stays bounded to ready, in-progress, and blocked work-item states only.",
  ];
  const seenRelativePaths = new Set<string>();
  const allPlanningEntries = listProjectWorkItemPlanningEntries(context, project);
  const planningEntries = listPlanningBacklogEntries(allPlanningEntries);

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "ready-next",
      documentType: "work-item",
      strategy: "planning-ranked",
      limit: planningBacklogLimits.ready,
      description: "Read the highest-priority ready work items that can start immediately.",
      candidatePaths: planningEntries
        .filter((entry) => entry.planning.planningState === "ready")
        .map((entry) => entry.document.relativePath),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "in-progress-current",
      documentType: "work-item",
      strategy: "planning-ranked",
      limit: planningBacklogLimits.inProgress,
      description: "Read bounded in-progress work items for current execution context.",
      candidatePaths: planningEntries
        .filter((entry) => entry.planning.planningState === "in_progress")
        .map((entry) => entry.document.relativePath),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "blocked-follow-up",
      documentType: "work-item",
      strategy: "planning-ranked",
      limit: planningBacklogLimits.blocked,
      description: "Read bounded blocked work items that still need dependency follow-up.",
      candidatePaths: planningEntries
        .filter((entry) => entry.planning.planningState === "blocked")
        .map((entry) => entry.document.relativePath),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  if (documents.length === 0) {
    notes.push("No bounded planning backlog work items were found for this project.");
  }

  return createBoundedReadResult(
    "planning-backlog",
    project,
    stages,
    documents,
    notes,
    undefined,
    buildPlanningExplainability(allPlanningEntries, documents),
  );
};

/**
 * Reads a bounded exact-topic planning package for one project/topic and its
 * explicit same-project context locators.
 */
export const readPlanningTopicEntry = (
  input: PlanningTopicEntryInput,
  context = createRepositoryContext(),
): BoundedReadResult => {
  const project = ensureKebabCaseProject(input.project);
  const topic = ensureSlug(input.topic, "Topic");
  const stages: BoundedReadStage[] = [];
  const documents: ParsedDocument[] = [];
  const notes = [
    "Planning topic entry reads only same-project active work-item documents whose topic exactly matches the requested topic.",
    "Planning topic entry stays bounded and ordered by derived planning state before date/path tie-breaks.",
    "Planning topic entry follows only explicit same-project context locators from the selected work items, with fixed per-type limits and no fallback expansion.",
  ];
  const seenRelativePaths = new Set<string>();
  const allPlanningEntries = listProjectWorkItemPlanningEntries(context, project);
  const planningEntryByPath = new Map(
    allPlanningEntries.map((entry) => [entry.document.relativePath, entry] as const),
  );
  const planningEntries = sortPlanningEntries(allPlanningEntries).filter((entry) => {
    return entry.definition.metadata.topic === topic;
  });

  const selectedWorkItemDocuments = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "work-item-exact",
      documentType: "work-item",
      strategy: "topic-exact",
      limit: planningTopicEntryLimits.workItems,
      description: "Read bounded exact-topic active work items in planning-ranked order.",
      candidatePaths: planningEntries.map((entry) => entry.document.relativePath),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const selectedPlanningEntries = selectedWorkItemDocuments.map((document) => {
    const planningEntry = planningEntryByPath.get(document.relativePath);
    if (!planningEntry) {
      throw new Error(`Missing planning entry for ${document.relativePath}`);
    }

    return planningEntry;
  });

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "context-canonical-explicit",
      documentType: "canonical-doc",
      strategy: "reference-follow",
      limit: planningTopicEntryLimits.canonicalDocs,
      description: "Read bounded explicit canonical-doc context from the selected work items.",
      candidatePaths: collectPlanningContextCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
        "canonical-doc",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "context-decision-explicit",
      documentType: "decision",
      strategy: "reference-follow",
      limit: planningTopicEntryLimits.decisions,
      description: "Read bounded explicit decision context from the selected work items.",
      candidatePaths: collectPlanningContextCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
        "decision",
      ),
      allowedStatuses: currentStatuses,
    },
    context,
  );

  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "context-session-note-explicit",
      documentType: "session-note",
      strategy: "reference-follow",
      limit: planningTopicEntryLimits.sessionNotes,
      description: "Read bounded explicit session-note context from the selected work items.",
      candidatePaths: collectPlanningContextCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
        "session-note",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  if (documents.length === 0) {
    notes.push("No bounded planning topic work items were found for this topic.");
  }

  return createBoundedReadResult(
    "planning-topic-entry",
    project,
    stages,
    documents,
    notes,
    topic,
    buildPlanningExplainability(allPlanningEntries, selectedWorkItemDocuments),
  );
};

/**
 * Reads a bounded topic-centered package for one project topic.
 */
export const readTopicEntry = (
  input: TopicEntryInput,
  context = createRepositoryContext(),
): BoundedReadResult => {
  const project = ensureKebabCaseProject(input.project);
  const topic = ensureSlug(input.topic, "Topic");
  const stages: BoundedReadStage[] = [];
  const documents: ParsedDocument[] = [];
  const notes = [
    "Topic entry prioritizes canonical docs, then exact topic documents, then bounded filename fallback matches.",
  ];
  const seenRelativePaths = new Set<string>();

  const exactCanonicalDocs = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "canonical-exact",
      documentType: "canonical-doc",
      strategy: "topic-exact",
      limit: topicEntryLimits.canonicalDocs,
      description: "Read exact-topic canonical docs across scopes before any fallback.",
      candidatePaths: collectCanonicalDocPaths(
        context,
        project,
        topic,
        candidateLimitForStage(topicEntryLimits.canonicalDocs),
        "exact",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactRunbooks = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "runbook-exact",
      documentType: "runbook",
      strategy: "topic-exact",
      limit: topicEntryLimits.runbooks,
      description: "Read an exact-topic runbook when one exists.",
      candidatePaths: collectFlatTopicPaths(
        context,
        project,
        "runbooks",
        topic,
        candidateLimitForStage(topicEntryLimits.runbooks),
        "exact",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactProviderNotes = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "provider-exact",
      documentType: "provider-note",
      strategy: "topic-exact",
      limit: topicEntryLimits.providerNotes,
      description: "Read an exact-topic provider note when the topic maps to a provider surface.",
      candidatePaths: collectFlatTopicPaths(
        context,
        project,
        "provider-notes",
        topic,
        candidateLimitForStage(topicEntryLimits.providerNotes),
        "exact",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactDecisions = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "decision-exact",
      documentType: "decision",
      strategy: "topic-exact",
      limit: topicEntryLimits.decisions,
      description: "Read the newest exact-topic active-or-draft decisions by dated path.",
      candidatePaths: collectDatedTopicPaths(
        context,
        project,
        "decisions",
        topic,
        candidateLimitForStage(topicEntryLimits.decisions),
        "exact",
        "flat",
      ),
      allowedStatuses: currentStatuses,
    },
    context,
  );

  const exactSessionNotes = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "session-exact",
      documentType: "session-note",
      strategy: "topic-exact",
      limit: topicEntryLimits.sessionNotes,
      description: "Read the freshest exact-topic session note for recent execution context.",
      candidatePaths: collectDatedTopicPaths(
        context,
        project,
        "session-log",
        topic,
        candidateLimitForStage(topicEntryLimits.sessionNotes),
        "exact",
        "year-month",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactVerificationResults = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "verification-exact",
      documentType: "verification-result",
      strategy: "topic-exact",
      limit: topicEntryLimits.verificationResults,
      description: "Read the freshest exact-topic verification result for current evidence.",
      candidatePaths: collectDatedTopicPaths(
        context,
        project,
        "verification",
        topic,
        candidateLimitForStage(topicEntryLimits.verificationResults),
        "exact",
        "flat",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactMatchCount =
    exactCanonicalDocs.length +
    exactRunbooks.length +
    exactProviderNotes.length +
    exactDecisions.length +
    exactSessionNotes.length +
    exactVerificationResults.length;

  if (exactMatchCount === 0) {
    notes.push("No exact topic matches were found; returned bounded filename contains matches instead.");

    appendStage(
      stages,
      documents,
      seenRelativePaths,
      {
        name: "canonical-fallback",
        documentType: "canonical-doc",
        strategy: "topic-contains",
        limit: topicEntryLimits.fallbackCanonicalDocs,
        description: "Fallback to bounded canonical docs whose topic slug contains the requested topic.",
        candidatePaths: collectCanonicalDocPaths(
          context,
          project,
          topic,
          candidateLimitForStage(topicEntryLimits.fallbackCanonicalDocs),
          "contains",
        ),
        allowedStatuses: activeStatuses,
      },
      context,
    );

    appendStage(
      stages,
      documents,
      seenRelativePaths,
      {
        name: "runbook-fallback",
        documentType: "runbook",
        strategy: "topic-contains",
        limit: topicEntryLimits.fallbackRunbooks,
        description: "Fallback to one bounded runbook whose topic slug contains the request.",
        candidatePaths: collectFlatTopicPaths(
          context,
          project,
          "runbooks",
          topic,
          candidateLimitForStage(topicEntryLimits.fallbackRunbooks),
          "contains",
        ),
        allowedStatuses: activeStatuses,
      },
      context,
    );

    appendStage(
      stages,
      documents,
      seenRelativePaths,
      {
        name: "provider-fallback",
        documentType: "provider-note",
        strategy: "topic-contains",
        limit: topicEntryLimits.fallbackProviderNotes,
        description: "Fallback to one bounded provider note whose topic slug contains the request.",
        candidatePaths: collectFlatTopicPaths(
          context,
          project,
          "provider-notes",
          topic,
          candidateLimitForStage(topicEntryLimits.fallbackProviderNotes),
          "contains",
        ),
        allowedStatuses: activeStatuses,
      },
      context,
    );

    appendStage(
      stages,
      documents,
      seenRelativePaths,
      {
        name: "decision-fallback",
        documentType: "decision",
        strategy: "topic-contains",
        limit: topicEntryLimits.fallbackDecisions,
        description: "Fallback to the newest bounded decisions whose topic slug contains the request.",
        candidatePaths: collectDatedTopicPaths(
          context,
          project,
          "decisions",
          topic,
          candidateLimitForStage(topicEntryLimits.fallbackDecisions),
          "contains",
          "flat",
        ),
        allowedStatuses: currentStatuses,
      },
      context,
    );
  }

  if (documents.length === 0) {
    notes.push("No bounded topic-entry sources were found for this topic.");
  }

  return createBoundedReadResult("topic-entry", project, stages, documents, notes, topic);
};

/**
 * Reads a bounded rationale package for one project topic.
 */
export const readRationaleEntry = (
  input: RationaleEntryInput,
  context = createRepositoryContext(),
): BoundedReadResult => {
  const project = ensureKebabCaseProject(input.project);
  const topic = ensureSlug(input.topic, "Topic");
  const stages: BoundedReadStage[] = [];
  const documents: ParsedDocument[] = [];
  const notes = [
    "Rationale entry prioritizes canonical docs, follows explicit references, then falls back to bounded topic matches.",
  ];
  const seenRelativePaths = new Set<string>();

  const canonicalDocuments = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "canonical-exact",
      documentType: "canonical-doc",
      strategy: "topic-exact",
      limit: rationaleEntryLimits.canonicalDocs,
      description: "Read exact-topic canonical docs first because they define the current authority boundary.",
      candidatePaths: collectCanonicalDocPaths(
        context,
        project,
        topic,
        candidateLimitForStage(rationaleEntryLimits.canonicalDocs),
        "exact",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const referencedDecisionTopics = canonicalDocuments.flatMap((document) =>
    collectReferenceTopics(document, "decision"),
  );
  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "decision-reference",
      documentType: "decision",
      strategy: "reference-follow",
      limit: rationaleEntryLimits.referencedDecisions,
      description: "Follow explicit decision references from the selected canonical docs.",
      candidatePaths: referencedDecisionTopics.flatMap((decisionTopic) =>
        collectDatedTopicPaths(
          context,
          project,
          "decisions",
          decisionTopic,
          candidateLimitForStage(rationaleEntryLimits.referencedDecisions),
          "exact",
          "flat",
        ),
      ),
      allowedStatuses: rationaleDecisionStatuses,
    },
    context,
  );

  const referencedRunbookTopics = canonicalDocuments.flatMap((document) =>
    collectReferenceTopics(document, "runbook"),
  );
  appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "runbook-reference",
      documentType: "runbook",
      strategy: "reference-follow",
      limit: rationaleEntryLimits.referencedRunbooks,
      description: "Follow explicit runbook references from the selected canonical docs.",
      candidatePaths: referencedRunbookTopics.flatMap((runbookTopic) =>
        collectFlatTopicPaths(
          context,
          project,
          "runbooks",
          runbookTopic,
          candidateLimitForStage(rationaleEntryLimits.referencedRunbooks),
          "exact",
        ),
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactDecisions = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "decision-exact",
      documentType: "decision",
      strategy: "topic-exact",
      limit: rationaleEntryLimits.exactDecisions,
      description: "Read the newest exact-topic decisions, including superseded ones when needed for rationale history.",
      candidatePaths: collectDatedTopicPaths(
        context,
        project,
        "decisions",
        topic,
        candidateLimitForStage(rationaleEntryLimits.exactDecisions),
        "exact",
        "flat",
      ),
      allowedStatuses: rationaleDecisionStatuses,
    },
    context,
  );

  const exactRunbooks = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "runbook-exact",
      documentType: "runbook",
      strategy: "topic-exact",
      limit: rationaleEntryLimits.exactRunbooks,
      description: "Read an exact-topic runbook when one carries operational rationale.",
      candidatePaths: collectFlatTopicPaths(
        context,
        project,
        "runbooks",
        topic,
        candidateLimitForStage(rationaleEntryLimits.exactRunbooks),
        "exact",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactProviderNotes = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "provider-exact",
      documentType: "provider-note",
      strategy: "topic-exact",
      limit: rationaleEntryLimits.exactProviderNotes,
      description: "Read an exact-topic provider note when provider constraints explain the rationale.",
      candidatePaths: collectFlatTopicPaths(
        context,
        project,
        "provider-notes",
        topic,
        candidateLimitForStage(rationaleEntryLimits.exactProviderNotes),
        "exact",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactSessionNotes = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "session-exact",
      documentType: "session-note",
      strategy: "topic-exact",
      limit: rationaleEntryLimits.sessionNotes,
      description: "Read the freshest exact-topic session note for recent supporting context.",
      candidatePaths: collectDatedTopicPaths(
        context,
        project,
        "session-log",
        topic,
        candidateLimitForStage(rationaleEntryLimits.sessionNotes),
        "exact",
        "year-month",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactVerificationResults = appendStage(
    stages,
    documents,
    seenRelativePaths,
    {
      name: "verification-exact",
      documentType: "verification-result",
      strategy: "topic-exact",
      limit: rationaleEntryLimits.verificationResults,
      description: "Read the freshest exact-topic verification result for supporting evidence.",
      candidatePaths: collectDatedTopicPaths(
        context,
        project,
        "verification",
        topic,
        candidateLimitForStage(rationaleEntryLimits.verificationResults),
        "exact",
        "flat",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  const exactMatchCount =
    canonicalDocuments.length +
    exactDecisions.length +
    exactRunbooks.length +
    exactProviderNotes.length +
    exactSessionNotes.length +
    exactVerificationResults.length;

  if (exactMatchCount === 0) {
    notes.push("No exact rationale sources were found; returned bounded filename contains matches instead.");

    appendStage(
      stages,
      documents,
      seenRelativePaths,
      {
        name: "canonical-fallback",
        documentType: "canonical-doc",
        strategy: "topic-contains",
        limit: rationaleEntryLimits.fallbackCanonicalDocs,
        description: "Fallback to bounded canonical docs whose topic slug contains the requested topic.",
        candidatePaths: collectCanonicalDocPaths(
          context,
          project,
          topic,
          candidateLimitForStage(rationaleEntryLimits.fallbackCanonicalDocs),
          "contains",
        ),
        allowedStatuses: activeStatuses,
      },
      context,
    );

    appendStage(
      stages,
      documents,
      seenRelativePaths,
      {
        name: "decision-fallback",
        documentType: "decision",
        strategy: "topic-contains",
        limit: rationaleEntryLimits.fallbackDecisions,
        description: "Fallback to the newest bounded decisions whose topic slug contains the request.",
        candidatePaths: collectDatedTopicPaths(
          context,
          project,
          "decisions",
          topic,
          candidateLimitForStage(rationaleEntryLimits.fallbackDecisions),
          "contains",
          "flat",
        ),
        allowedStatuses: rationaleDecisionStatuses,
      },
      context,
    );

    appendStage(
      stages,
      documents,
      seenRelativePaths,
      {
        name: "runbook-fallback",
        documentType: "runbook",
        strategy: "topic-contains",
        limit: rationaleEntryLimits.fallbackRunbooks,
        description: "Fallback to one bounded runbook whose topic slug contains the request.",
        candidatePaths: collectFlatTopicPaths(
          context,
          project,
          "runbooks",
          topic,
          candidateLimitForStage(rationaleEntryLimits.fallbackRunbooks),
          "contains",
        ),
        allowedStatuses: activeStatuses,
      },
      context,
    );
  }

  if (documents.length === 0) {
    notes.push("No bounded rationale-entry sources were found for this topic.");
  }

  return createBoundedReadResult("rationale-entry", project, stages, documents, notes, topic);
};
