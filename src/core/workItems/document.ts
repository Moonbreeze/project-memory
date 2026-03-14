import type { ParsedDocument } from "../types/index.ts";

import { renderList, renderTemplate } from "../documents/content.ts";

import { WorkItemSectionHeading as WorkItemSectionHeadingValues } from "./constants.ts";
import {
  deriveWorkItemPlanningState,
  resolveWorkItemLocatorRelativePath,
  validateWorkItemDefinition,
} from "./spec.ts";
import {
  isWorkItemDocumentStatus,
  isWorkItemState,
  type WorkItemContextLocator,
  type WorkItemDefinition,
  type WorkItemDocumentLocator,
  type WorkItemDocumentStatus,
  type WorkItemEvidenceLocator,
  type WorkItemOrigin,
  type WorkItemRecordLocator,
  type WorkItemState,
} from "./types.ts";

type WorkItemSectionHeading = typeof WorkItemSectionHeadingValues[number];

type WorkItemSections = Record<WorkItemSectionHeading, string>;

const emptySections = (): WorkItemSections => {
  return {
    "## Summary": "",
    "## Outcome": "",
    "## Provenance": "",
    "## Dependencies": "",
    "## Context": "",
    "## Verification": "",
    "## Evidence": "",
  };
};

const splitWorkItemSections = (body: string): WorkItemSections => {
  const sections = emptySections();
  let currentHeading: WorkItemSectionHeading | undefined;

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (WorkItemSectionHeadingValues.includes(trimmed as WorkItemSectionHeading)) {
      currentHeading = trimmed as WorkItemSectionHeading;
      continue;
    }

    if (!currentHeading) {
      continue;
    }

    sections[currentHeading] = sections[currentHeading]
      ? `${sections[currentHeading]}\n${line}`
      : line;
  }

  return sections;
};

const parseBulletList = (sectionBody: string, fieldName: string): string[] => {
  const lines = sectionBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || (lines.length === 1 && lines[0] === "- none")) {
    return [];
  }

  const items: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("- ")) {
      throw new Error(`${fieldName} must use Markdown bullet items`);
    }

    const item = line.slice(2).trim();
    if (!item) {
      throw new Error(`${fieldName} must not contain empty bullet items`);
    }

    items.push(item);
  }

  return items;
};

const parseLocatorWithKinds = <TLocator extends WorkItemDocumentLocator>(
  value: string,
  allowedKinds: readonly string[],
  fieldName: string,
): TLocator => {
  const trimmedValue = value.trim();
  const parts = trimmedValue.split(":");
  const [rawType, project, third, fourth] = parts;

  if (!rawType || !project || !third || !fourth || parts.length !== 4) {
    throw new Error(`${fieldName} must use a supported locator format`);
  }

  if (!allowedKinds.includes(rawType)) {
    throw new Error(`${fieldName} must use one of: ${allowedKinds.join(", ")}`);
  }

  if (rawType === "canonical-doc") {
    return {
      type: rawType,
      project,
      registryScope: third,
      topic: fourth,
    } as TLocator;
  }

  return {
    type: rawType,
    project,
    date: third,
    topic: fourth,
  } as TLocator;
};

const parseLocatorList = <TLocator extends WorkItemDocumentLocator>(
  sectionBody: string,
  allowedKinds: readonly string[],
  fieldName: string,
): TLocator[] => {
  return parseBulletList(sectionBody, fieldName).map((item) => {
    return parseLocatorWithKinds<TLocator>(item, allowedKinds, fieldName);
  });
};

const parseOrigin = (sectionBody: string): WorkItemOrigin => {
  const items = parseBulletList(sectionBody, "provenance");
  if (items.length !== 1) {
    throw new Error("provenance must contain exactly one bullet item");
  }

  const [originItem] = items;
  if (!originItem) {
    throw new Error("provenance must contain exactly one bullet item");
  }

  if (originItem.startsWith("ad-hoc:")) {
    return {
      kind: "ad-hoc",
      note: originItem.slice("ad-hoc:".length).trim(),
    };
  }

  const locator = parseLocatorWithKinds<
    Extract<WorkItemDocumentLocator, { type: "decision" | "session-note" }>
  >(originItem, ["decision", "session-note"], "provenance");

  if (locator.type === "decision") {
    return {
      kind: "decision",
      locator,
    };
  }

  return {
    kind: "session-note",
    locator,
  };
};

const readWorkItemStatus = (document: ParsedDocument): WorkItemDocumentStatus => {
  if (!isWorkItemDocumentStatus(document.metadata.status)) {
    throw new Error("Work-item documents must use draft, active, or archived status");
  }

  return document.metadata.status;
};

const readWorkItemState = (document: ParsedDocument): WorkItemState => {
  if (!isWorkItemState(document.metadata.work_item_state)) {
    throw new Error("Work-item documents must declare a valid work_item_state");
  }

  return document.metadata.work_item_state;
};

/**
 * Serializes one work-item locator into the stable body format.
 */
export const serializeWorkItemLocator = (
  locator: WorkItemDocumentLocator,
): string => {
  if (locator.type === "canonical-doc") {
    return `${locator.type}:${locator.project}:${locator.registryScope}:${locator.topic}`;
  }

  return `${locator.type}:${locator.project}:${locator.date}:${locator.topic}`;
};

/**
 * Parses one serialized locator string into the typed work-item locator model.
 */
export const parseWorkItemLocatorString = (
  value: string,
): WorkItemDocumentLocator => {
  return parseLocatorWithKinds<WorkItemDocumentLocator>(
    value,
    ["decision", "session-note", "verification-result", "canonical-doc", "work-item"],
    "locator",
  );
};

/**
 * Renders one validated work-item definition into the managed Markdown layout.
 */
export const renderWorkItemBody = (
  template: string,
  definition: WorkItemDefinition,
): string => {
  const originValue =
    definition.origin.kind === "ad-hoc"
      ? `ad-hoc: ${definition.origin.note}`
      : serializeWorkItemLocator(definition.origin.locator);

  return renderTemplate(template, {
    summary: definition.summary.trim(),
    outcome: definition.outcome.trim(),
    provenance: renderList([originValue]),
    dependencies: renderList(definition.dependencies.map(serializeWorkItemLocator)),
    context: renderList(definition.context.map(serializeWorkItemLocator)),
    verification: renderList(definition.verification),
    evidence: renderList(definition.evidence.map(serializeWorkItemLocator)),
  });
};

/**
 * Parses one stored work-item Markdown document into the typed Session 5 schema.
 */
export const parseWorkItemDocument = (
  document: ParsedDocument,
): WorkItemDefinition => {
  if (document.type !== "work-item") {
    throw new Error("Only work-item documents can be parsed as work items");
  }

  const sections = splitWorkItemSections(document.body);

  return {
    metadata: {
      project: document.metadata.project,
      topic: document.metadata.topic,
      date: document.metadata.date,
      status: readWorkItemStatus(document),
      workItemState: readWorkItemState(document),
    },
    summary: sections["## Summary"].trim(),
    outcome: sections["## Outcome"].trim(),
    origin: parseOrigin(sections["## Provenance"]),
    dependencies: parseLocatorList<WorkItemRecordLocator>(
      sections["## Dependencies"],
      ["work-item"],
      "dependencies",
    ),
    context: parseLocatorList<WorkItemContextLocator>(
      sections["## Context"],
      ["decision", "canonical-doc", "session-note"],
      "context",
    ),
    verification: parseBulletList(sections["## Verification"], "verification"),
    evidence: parseLocatorList<WorkItemEvidenceLocator>(
      sections["## Evidence"],
      ["verification-result", "session-note"],
      "evidence",
    ),
  };
};

/**
 * Validates one parsed work-item document against the structured Session 5 schema.
 */
export const validateStoredWorkItemDocument = (
  document: ParsedDocument,
): void => {
  const validation = validateWorkItemDefinition(parseWorkItemDocument(document));
  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }
};

export {
  deriveWorkItemPlanningState,
  resolveWorkItemLocatorRelativePath,
  validateWorkItemDefinition,
};
