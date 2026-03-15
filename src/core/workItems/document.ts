import type { ParsedDocument } from "../types/index.ts";

import { renderList, renderTemplate } from "../documents/content.ts";

import { WorkItemSectionHeading as WorkItemSectionHeadingValues } from "./constants.ts";
import {
  deriveWorkItemPlanningState,
  resolveWorkItemLocatorRelativePath,
  validateWorkItemDefinition,
} from "./spec.ts";
import {
  isWorkItemSectionHeading,
  isWorkItemDocumentStatus,
  isWorkItemState,
  type WorkItemContextLocator,
  type WorkItemDefinition,
  type WorkItemDocumentLocator,
  type WorkItemDocumentStatus,
  type WorkItemEvidenceLocator,
  type WorkItemOrigin,
  type WorkItemPlanningEntry,
  type WorkItemRecordLocator,
  type WorkItemState,
} from "./types.ts";

/**
 * Markdown heading values supported in parsed work-item bodies.
 */
type WorkItemSectionHeading = typeof WorkItemSectionHeadingValues[number];

/**
 * Parsed work-item body sections keyed by required Markdown heading.
 */
type WorkItemSections = Record<WorkItemSectionHeading, string>;

/**
 * Creates the initial empty section map for one work-item body parse.
 */
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

/**
 * Splits one work-item body into the required heading-keyed sections.
 */
const splitWorkItemSections = (body: string): WorkItemSections => {
  const sections = emptySections();
  let currentHeading: WorkItemSectionHeading | undefined;

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (isWorkItemSectionHeading(trimmed)) {
      currentHeading = trimmed;
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

/**
 * Parses one Markdown bullet list section into trimmed item strings.
 */
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

/**
 * Builds one typed locator when the raw type is `canonical-doc`.
 */
const createCanonicalDocLocator = (
  rawType: string,
  project: string,
  registryScope: string,
  topic: string,
): Extract<WorkItemDocumentLocator, { type: "canonical-doc" }> | undefined => {
  if (rawType !== "canonical-doc") {
    return undefined;
  }

  return {
    type: "canonical-doc",
    project,
    registryScope,
    topic,
  };
};

/**
 * Builds one typed locator when the raw type is a dated document kind.
 */
const createDatedLocator = (
  rawType: string,
  project: string,
  date: string,
  topic: string,
): Exclude<WorkItemDocumentLocator, { type: "canonical-doc" }> | undefined => {
  switch (rawType) {
    case "decision":
    case "session-note":
    case "verification-result":
    case "work-item":
      return {
        type: rawType,
        project,
        date,
        topic,
      };
    default:
      return undefined;
  }
};

/**
 * Builds one typed work-item locator from raw locator components.
 */
const createWorkItemDocumentLocator = (
  rawType: string,
  project: string,
  third: string,
  fourth: string,
): WorkItemDocumentLocator | undefined => {
  return (
    createCanonicalDocLocator(rawType, project, third, fourth)
    ?? createDatedLocator(rawType, project, third, fourth)
  );
};

/**
 * Builds one typed work-item dependency locator from raw locator components.
 */
const createWorkItemRecordLocator = (
  rawType: string,
  project: string,
  date: string,
  topic: string,
): WorkItemRecordLocator | undefined => {
  const locator = createDatedLocator(rawType, project, date, topic);
  return locator?.type === "work-item" ? locator : undefined;
};

/**
 * Builds one typed work-item context locator from raw locator components.
 */
const createWorkItemContextLocator = (
  rawType: string,
  project: string,
  third: string,
  fourth: string,
): WorkItemContextLocator | undefined => {
  const locator = createWorkItemDocumentLocator(rawType, project, third, fourth);
  if (
    locator?.type === "decision"
    || locator?.type === "canonical-doc"
    || locator?.type === "session-note"
  ) {
    return locator;
  }

  return undefined;
};

/**
 * Builds one typed work-item evidence locator from raw locator components.
 */
const createWorkItemEvidenceLocator = (
  rawType: string,
  project: string,
  date: string,
  topic: string,
): WorkItemEvidenceLocator | undefined => {
  const locator = createDatedLocator(rawType, project, date, topic);
  if (locator?.type === "verification-result" || locator?.type === "session-note") {
    return locator;
  }

  return undefined;
};

/**
 * Builds one typed provenance locator from raw locator components.
 */
const createWorkItemOriginLocator = (
  rawType: string,
  project: string,
  date: string,
  topic: string,
): Extract<WorkItemDocumentLocator, { type: "decision" | "session-note" }> | undefined => {
  const locator = createDatedLocator(rawType, project, date, topic);
  if (locator?.type === "decision" || locator?.type === "session-note") {
    return locator;
  }

  return undefined;
};

/**
 * Parses one serialized locator with a caller-provided typed locator builder.
 */
const parseLocatorWithKinds = <TLocator extends WorkItemDocumentLocator>(
  value: string,
  fieldName: string,
  createLocator: (
    rawType: string,
    project: string,
    third: string,
    fourth: string,
  ) => TLocator | undefined,
): TLocator => {
  const trimmedValue = value.trim();
  const parts = trimmedValue.split(":");
  const [rawType, project, third, fourth] = parts;

  if (!rawType || !project || !third || !fourth || parts.length !== 4) {
    throw new Error(`${fieldName} must use a supported locator format`);
  }

  const locator = createLocator(rawType, project, third, fourth);
  if (!locator) {
    throw new Error(`${fieldName} must use a supported locator format`);
  }

  return locator;
};

/**
 * Parses one bullet-list section of serialized locators into typed locators.
 */
const parseLocatorList = <TLocator extends WorkItemDocumentLocator>(
  sectionBody: string,
  fieldName: string,
  createLocator: (
    rawType: string,
    project: string,
    third: string,
    fourth: string,
  ) => TLocator | undefined,
): TLocator[] => {
  return parseBulletList(sectionBody, fieldName).map((item) => {
    return parseLocatorWithKinds(item, fieldName, createLocator);
  });
};

/**
 * Parses the provenance section into one structured work-item origin.
 */
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

  const locator = parseLocatorWithKinds(
    originItem,
    "provenance",
    createWorkItemOriginLocator,
  );

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

/**
 * Reads and validates the document status for one stored work-item document.
 */
const readWorkItemStatus = (document: ParsedDocument): WorkItemDocumentStatus => {
  if (!isWorkItemDocumentStatus(document.metadata.status)) {
    throw new Error("Work-item documents must use draft, active, or archived status");
  }

  return document.metadata.status;
};

/**
 * Reads and validates the execution state for one stored work-item document.
 */
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
  return parseLocatorWithKinds(
    value,
    "locator",
    createWorkItemDocumentLocator,
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
    dependencies: parseLocatorList(
      sections["## Dependencies"],
      "dependencies",
      createWorkItemRecordLocator,
    ),
    context: parseLocatorList(
      sections["## Context"],
      "context",
      createWorkItemContextLocator,
    ),
    verification: parseBulletList(sections["## Verification"], "verification"),
    evidence: parseLocatorList(
      sections["## Evidence"],
      "evidence",
      createWorkItemEvidenceLocator,
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

/**
 * Builds derived planning entries for the provided active work-item documents.
 */
export const buildWorkItemPlanningEntries = (
  documents: ParsedDocument[],
): WorkItemPlanningEntry[] => {
  const workItemDefinitions = new Map(
    documents
      .filter((document) => document.type === "work-item")
      .map((document) => [document.relativePath, parseWorkItemDocument(document)]),
  );

  return documents
    .filter((document) => document.type === "work-item")
    .map((document) => {
      const definition = workItemDefinitions.get(document.relativePath);
      if (!definition) {
        throw new Error(`Missing parsed work-item definition for ${document.relativePath}`);
      }

      const unresolvedDependencyCount = definition.dependencies.reduce((count, dependency) => {
        const dependencyRelativePath = resolveWorkItemLocatorRelativePath(dependency);
        const dependencyDefinition = workItemDefinitions.get(dependencyRelativePath);
        if (!dependencyDefinition || dependencyDefinition.metadata.workItemState !== "done") {
          return count + 1;
        }

        return count;
      }, 0);

      return {
        document,
        definition,
        planning: {
          planningState: deriveWorkItemPlanningState({
            documentStatus: definition.metadata.status,
            workItemState: definition.metadata.workItemState,
            unresolvedDependencyCount,
          }),
          dependencyCount: definition.dependencies.length,
          unresolvedDependencyCount,
        },
      };
    });
};

export {
  deriveWorkItemPlanningState,
  resolveWorkItemLocatorRelativePath,
  validateWorkItemDefinition,
};
