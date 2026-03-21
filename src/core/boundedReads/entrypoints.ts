import { createRepositoryContext } from "../config/index.ts";
import { ensureKebabCaseProject, ensureSlug } from "../documents/index.ts";
import type {
  BoundedReadResult,
  BoundedReadStage,
  ColdStartInput,
  ParsedDocument,
  PlanningBacklogInput,
  PlanningTopicEntryInput,
  RationaleEntryInput,
  TopicEntryInput,
} from "../types/index.ts";

import {
  activeStatuses,
  candidateLimitForStage,
  coldStartLimits,
  currentStatuses,
  planningBacklogLimits,
  planningTopicEntryLimits,
  rationaleDecisionStatuses,
  rationaleEntryLimits,
  topicEntryLimits,
} from "./constants.ts";
import {
  collectCanonicalDocPaths,
  collectDatedTopicPaths,
  collectFlatTopicPaths,
  collectTimelineOrderedDatedTopicPaths,
  filterColdStartCanonicalPaths,
} from "./filesystem.ts";
import {
  buildPlanningExplainability,
  collectPlanningDependencyCandidatePaths,
  collectPlanningLocatorCandidatePaths,
  hasExactTopicWorkItem,
  listPlanningBacklogEntries,
  listProjectWorkItemPlanningEntries,
  sortPlanningEntries,
} from "./planning.ts";
import { appendStage, collectReferenceTopics, createBoundedReadResult } from "./stages.ts";

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
      candidatePaths: filterColdStartCanonicalPaths(
        collectCanonicalDocPaths(
          context,
          project,
          "",
          candidateLimitForStage(coldStartLimits.canonicalDocs),
          "all",
        ),
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
  const { planningEntries: allPlanningEntries, invalidDocuments } = listProjectWorkItemPlanningEntries(
    context,
    project,
  );
  const planningEntries = listPlanningBacklogEntries(allPlanningEntries);

  if (invalidDocuments.length > 0) {
    notes.push(
      `Skipped ${invalidDocuments.length} invalid work-item document${invalidDocuments.length === 1 ? "" : "s"} during planning aggregation; inspect invalidDocuments for details.`,
    );
  }

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
    invalidDocuments,
  );
};

/**
 * Reads a bounded exact-topic planning package for one project/topic and its
 * explicit same-project dependency, context, and evidence locators.
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
    "Planning topic entry seeds work-item selection with same-project active documents whose topic exactly matches the requested topic.",
    "Planning topic entry stays bounded and ordered by derived planning state before timeline/path tie-breaks.",
    "Planning topic entry follows only explicit same-project dependency work items from the selected work items, with a fixed limit and no recursive expansion.",
    "Planning topic entry follows only explicit same-project context locators from the selected work items, with fixed per-type limits and no fallback expansion.",
    "Planning topic entry follows only explicit same-project evidence locators from the selected work items, with fixed per-type limits and no fallback expansion.",
  ];
  const seenRelativePaths = new Set<string>();
  const { planningEntries: allPlanningEntries, invalidDocuments } = listProjectWorkItemPlanningEntries(
    context,
    project,
  );
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
      name: "dependency-work-item-explicit",
      documentType: "work-item",
      strategy: "reference-follow",
      limit: planningTopicEntryLimits.dependencies,
      description:
        "Read bounded explicit dependency work items from the selected work items without recursive follow.",
      candidatePaths: collectPlanningDependencyCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
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
      name: "context-canonical-explicit",
      documentType: "canonical-doc",
      strategy: "reference-follow",
      limit: planningTopicEntryLimits.canonicalDocs,
      description: "Read bounded explicit canonical-doc context from the selected work items.",
      candidatePaths: collectPlanningLocatorCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
        "context",
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
      candidatePaths: collectPlanningLocatorCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
        "context",
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
      candidatePaths: collectPlanningLocatorCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
        "context",
        "session-note",
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
      name: "evidence-verification-explicit",
      documentType: "verification-result",
      strategy: "reference-follow",
      limit: planningTopicEntryLimits.verificationResults,
      description: "Read bounded explicit verification-result evidence from the selected work items.",
      candidatePaths: collectPlanningLocatorCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
        "evidence",
        "verification-result",
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
      name: "evidence-session-note-explicit",
      documentType: "session-note",
      strategy: "reference-follow",
      limit: planningTopicEntryLimits.evidenceSessionNotes,
      description: "Read bounded explicit session-note evidence from the selected work items.",
      candidatePaths: collectPlanningLocatorCandidatePaths(
        context,
        project,
        selectedPlanningEntries,
        "evidence",
        "session-note",
      ),
      allowedStatuses: activeStatuses,
    },
    context,
  );

  if (documents.length === 0) {
    notes.push("No bounded planning topic work items were found for this topic.");
  }

  if (invalidDocuments.length > 0) {
    notes.push(
      `Skipped ${invalidDocuments.length} invalid work-item document${invalidDocuments.length === 1 ? "" : "s"} during planning aggregation; inspect invalidDocuments for details.`,
    );
  }

  return createBoundedReadResult(
    "planning-topic-entry",
    project,
    stages,
    documents,
    notes,
    topic,
    buildPlanningExplainability(allPlanningEntries, selectedWorkItemDocuments),
    invalidDocuments,
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
      description: "Read the newest exact-topic active-or-draft decisions in timeline order.",
      candidatePaths: collectTimelineOrderedDatedTopicPaths(
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
      description: "Read the freshest exact-topic session note in timeline order.",
      candidatePaths: collectTimelineOrderedDatedTopicPaths(
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
      description: "Read the freshest exact-topic verification result in timeline order.",
      candidatePaths: collectTimelineOrderedDatedTopicPaths(
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

    const { planningEntries } = listProjectWorkItemPlanningEntries(context, project);
    if (hasExactTopicWorkItem(planningEntries, topic)) {
      notes.push(
        "Exact-topic work items exist for this topic, but topic-entry intentionally excludes work-item documents; use planning-topic-entry for bounded execution context.",
      );
    }

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
        description: "Fallback to the newest bounded decisions in timeline order whose topic slug contains the request.",
        candidatePaths: collectTimelineOrderedDatedTopicPaths(
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
        collectTimelineOrderedDatedTopicPaths(
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
      description: "Read the newest exact-topic decisions in timeline order, including superseded ones when needed for rationale history.",
      candidatePaths: collectTimelineOrderedDatedTopicPaths(
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
      description: "Read the freshest exact-topic session note in timeline order for recent supporting context.",
      candidatePaths: collectTimelineOrderedDatedTopicPaths(
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
      description: "Read the freshest exact-topic verification result in timeline order for supporting evidence.",
      candidatePaths: collectTimelineOrderedDatedTopicPaths(
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
        description: "Fallback to the newest bounded decisions in timeline order whose topic slug contains the request.",
        candidatePaths: collectTimelineOrderedDatedTopicPaths(
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
