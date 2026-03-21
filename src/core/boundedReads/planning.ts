import path from "node:path";

import {
  compareDocumentsByTimeline,
  readDocumentsSkippingInvalidWorkItems,
} from "../documents/index.ts";
import type {
  BoundedReadDependencySurface,
  BoundedReadPlanningExplainability,
  ParsedDocument,
  RepositoryContext,
} from "../types/index.ts";
import {
  buildWorkItemPlanningEntries,
  resolveWorkItemLocatorRelativePath,
} from "../workItems/index.ts";
import type {
  WorkItemPlanningEntry,
  WorkItemPlanningState,
} from "../workItems/index.ts";

import { activeStatuses } from "./constants.ts";
import { collectProjectWorkItemPaths, hasFile } from "./filesystem.ts";

/**
 * Reads all active work-item planning entries for one project.
 */
export const listProjectWorkItemPlanningEntries = (
  context: RepositoryContext,
  project: string,
) => {
  const { documents, invalidDocuments } = readDocumentsSkippingInvalidWorkItems(
    context,
    collectProjectWorkItemPaths(context, project),
  );
  const workItemDocuments = documents.filter((document) => {
    return document.type === "work-item" && document.metadata.status === "active";
  });

  return {
    planningEntries: buildWorkItemPlanningEntries(workItemDocuments),
    invalidDocuments,
  };
};

/**
 * Returns planning entries in stable planning rank order.
 */
export const sortPlanningEntries = (
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

    return compareDocumentsByTimeline(left.document, right.document, "desc");
  });
};

/**
 * Returns `true` when a planning state belongs to the backlog read surface.
 */
const isPlanningBacklogState = (planningState: WorkItemPlanningState): boolean => {
  return planningState === "ready" || planningState === "in_progress" || planningState === "blocked";
};

/**
 * Returns planning entries sorted the same way as the active work-item backlog.
 */
export const listPlanningBacklogEntries = (
  entries: WorkItemPlanningEntry[],
): WorkItemPlanningEntry[] => {
  return sortPlanningEntries(entries).filter((entry) => {
    return isPlanningBacklogState(entry.planning.planningState);
  });
};

/**
 * Collects explicit same-project planning locator targets for one relationship surface.
 */
export const collectPlanningLocatorCandidatePaths = (
  context: RepositoryContext,
  project: string,
  entries: WorkItemPlanningEntry[],
  relationship: "context" | "evidence",
  locatorType: "canonical-doc" | "decision" | "session-note" | "verification-result",
): string[] => {
  const seenRelativePaths = new Set<string>();
  const relativePaths: string[] = [];

  for (const entry of entries) {
    const locators =
      relationship === "context" ? entry.definition.context : entry.definition.evidence;
    for (const locator of locators) {
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
 * Collects explicit same-project dependency work-item paths from selected entries.
 */
export const collectPlanningDependencyCandidatePaths = (
  context: RepositoryContext,
  project: string,
  entries: WorkItemPlanningEntry[],
): string[] => {
  const seenRelativePaths = new Set<string>();
  const relativePaths: string[] = [];

  for (const entry of entries) {
    for (const dependency of entry.definition.dependencies) {
      if (dependency.project !== project) {
        continue;
      }

      const relativePath = resolveWorkItemLocatorRelativePath(dependency);
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
export const buildPlanningExplainability = (
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
 * Returns `true` when an exact-topic active work item exists for a topic.
 */
export const hasExactTopicWorkItem = (
  entries: WorkItemPlanningEntry[],
  topic: string,
): boolean => {
  return entries.some((entry) => {
    return entry.definition.metadata.topic === topic && activeStatuses.includes(entry.document.metadata.status);
  });
};
