import path from "node:path";

import { isoDatePattern, kebabCaseSlugPattern } from "../shared/index.ts";
import type { ValidationResult } from "../types/index.ts";

import type {
  WorkItemDefinition,
  WorkItemDocumentLocator,
  WorkItemOrigin,
  WorkItemPlanningState,
  WorkItemPlanningStateInput,
  WorkItemRecordLocator,
} from "./types.ts";

/**
 * Returns `true` when the value is a valid `YYYY-MM-DD` date string.
 */
const isDateString = (value: string): boolean => {
  return isoDatePattern.test(value);
};

/**
 * Returns `true` when the value is a non-empty kebab-case slug.
 */
const isSlug = (value: string): boolean => {
  return kebabCaseSlugPattern.test(value);
};

/**
 * Adds one validation error when a free-form text field is empty.
 */
const validateRequiredText = (
  errors: string[],
  value: string,
  fieldName: string,
): void => {
  if (!value.trim()) {
    errors.push(`${fieldName} must not be empty`);
  }
};

/**
 * Validates one locator shared by the future work-item relationship model.
 */
const validateLocator = (
  locator: WorkItemDocumentLocator,
  expectedProject: string,
  fieldName: string,
): string[] => {
  const errors: string[] = [];

  if (locator.project !== expectedProject) {
    errors.push(`${fieldName} must stay within project ${expectedProject}`);
  }

  if (!isSlug(locator.project)) {
    errors.push(`${fieldName} project must use kebab-case`);
  }

  if (!isSlug(locator.topic)) {
    errors.push(`${fieldName} topic must use kebab-case`);
  }

  if (locator.type === "canonical-doc") {
    if (!isSlug(locator.registryScope)) {
      errors.push(`${fieldName} registryScope must use kebab-case`);
    }

    return errors;
  }

  if (!isDateString(locator.date)) {
    errors.push(`${fieldName} date must use YYYY-MM-DD format`);
  }

  return errors;
};

/**
 * Validates one future work-item origin entry.
 */
const validateOrigin = (
  origin: WorkItemOrigin,
  project: string,
): string[] => {
  if (origin.kind === "ad-hoc") {
    const errors: string[] = [];
    validateRequiredText(errors, origin.note, "origin note");
    return errors;
  }

  return validateLocator(origin.locator, project, "origin locator");
};

/**
 * Validates one list of future same-project locators with optional self-checks.
 */
const validateLocatorList = (
  locators: WorkItemDocumentLocator[],
  project: string,
  fieldName: string,
  selfReferencePath?: string,
): string[] => {
  const errors: string[] = [];
  const seenPaths = new Set<string>();

  for (const locator of locators) {
    errors.push(...validateLocator(locator, project, fieldName));
    const relativePath = resolveWorkItemLocatorRelativePath(locator);

    if (selfReferencePath && relativePath === selfReferencePath) {
      errors.push(`${fieldName} must not reference the work item itself`);
    }

    if (seenPaths.has(relativePath)) {
      errors.push(`${fieldName} must not contain duplicate locators`);
      continue;
    }

    seenPaths.add(relativePath);
  }

  return errors;
};

/**
 * Resolves the planned active relative path for one future work-item locator.
 */
export const resolveWorkItemLocatorRelativePath = (
  locator: WorkItemDocumentLocator,
): string => {
  if (!isSlug(locator.project)) {
    throw new Error("Locator project must use kebab-case");
  }

  if (!isSlug(locator.topic)) {
    throw new Error("Locator topic must use kebab-case");
  }

  switch (locator.type) {
    case "canonical-doc":
      if (!isSlug(locator.registryScope)) {
        throw new Error("Canonical-doc locator registryScope must use kebab-case");
      }

      return path.join(
        "projects",
        locator.project,
        "canonical-docs",
        locator.registryScope,
        `${locator.topic}.md`,
      );
    case "decision": {
      if (!isDateString(locator.date)) {
        throw new Error("Decision locator date must use YYYY-MM-DD format");
      }

      const [year] = locator.date.split("-");
      return path.join(
        "projects",
        locator.project,
        "decisions",
        year,
        `${locator.date}-${locator.topic}.md`,
      );
    }
    case "session-note": {
      if (!isDateString(locator.date)) {
        throw new Error("Session-note locator date must use YYYY-MM-DD format");
      }

      const [year, month] = locator.date.split("-");
      return path.join(
        "projects",
        locator.project,
        "session-log",
        year,
        month,
        `${locator.date}-${locator.topic}.md`,
      );
    }
    case "verification-result": {
      if (!isDateString(locator.date)) {
        throw new Error("Verification-result locator date must use YYYY-MM-DD format");
      }

      const [year] = locator.date.split("-");
      return path.join(
        "projects",
        locator.project,
        "verification",
        year,
        `${locator.date}-${locator.topic}.md`,
      );
    }
    case "work-item": {
      if (!isDateString(locator.date)) {
        throw new Error("Work-item locator date must use YYYY-MM-DD format");
      }

      const [year] = locator.date.split("-");
      return path.join(
        "projects",
        locator.project,
        "work-items",
        year,
        `${locator.date}-${locator.topic}.md`,
      );
    }
  }
};

/**
 * Derives one future planning state from lifecycle and dependency inputs.
 */
export const deriveWorkItemPlanningState = (
  input: WorkItemPlanningStateInput,
): WorkItemPlanningState => {
  if (!Number.isInteger(input.unresolvedDependencyCount) || input.unresolvedDependencyCount < 0) {
    throw new Error("unresolvedDependencyCount must be a non-negative integer");
  }

  if (input.documentStatus === "archived") {
    return "archived";
  }

  if (input.documentStatus === "draft") {
    return "draft";
  }

  if (input.workItemState === "in_progress") {
    return "in_progress";
  }

  if (input.workItemState === "done") {
    return "done";
  }

  if (input.workItemState === "canceled") {
    return "canceled";
  }

  if (input.workItemState === "blocked" || input.unresolvedDependencyCount > 0) {
    return "blocked";
  }

  return "ready";
};

/**
 * Validates the structured Session 5 future work-item schema.
 */
export const validateWorkItemDefinition = (
  definition: WorkItemDefinition,
): ValidationResult => {
  const errors: string[] = [];
  const {
    metadata,
    summary,
    outcome,
    origin,
    dependencies,
    context,
    verification,
    evidence,
  } = definition;

  if (!isSlug(metadata.project)) {
    errors.push("metadata.project must use kebab-case");
  }

  if (!isSlug(metadata.topic)) {
    errors.push("metadata.topic must use kebab-case");
  }

  if (!isDateString(metadata.date)) {
    errors.push("metadata.date must use YYYY-MM-DD format");
  }

  validateRequiredText(errors, summary, "summary");
  validateRequiredText(errors, outcome, "outcome");

  if (verification.length === 0) {
    errors.push("verification must contain at least one item");
  }

  for (const verificationItem of verification) {
    validateRequiredText(errors, verificationItem, "verification item");
  }

  if (metadata.status === "draft" && metadata.workItemState !== "open") {
    errors.push("Draft work items must stay in the open execution state");
  }

  if (
    metadata.status === "archived"
    && metadata.workItemState !== "done"
    && metadata.workItemState !== "canceled"
  ) {
    errors.push("Archived work items must be done or canceled before archival");
  }

  errors.push(...validateOrigin(origin, metadata.project));

  const selfLocator: WorkItemRecordLocator = {
    type: "work-item",
    project: metadata.project,
    date: metadata.date,
    topic: metadata.topic,
  };
  const selfReferencePath = resolveWorkItemLocatorRelativePath(selfLocator);

  errors.push(
    ...validateLocatorList(dependencies, metadata.project, "dependencies", selfReferencePath),
  );
  errors.push(...validateLocatorList(context, metadata.project, "context"));
  errors.push(...validateLocatorList(evidence, metadata.project, "evidence"));

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
};
