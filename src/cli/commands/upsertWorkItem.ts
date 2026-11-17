import {
  isWorkItemDocumentStatus,
  isWorkItemOriginKind,
  isWorkItemState,
  parseWorkItemLocatorString,
  upsertWorkItem,
} from "../../core/index.ts";
import type {
  WorkItemContextLocator,
  WorkItemEvidenceLocator,
  WorkItemOrigin,
  WorkItemRecordLocator,
} from "../../core/index.ts";
import {
  parseList,
  parseRequiredJson,
  parseOptionalDocumentSource,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

const parseDefinitionOfDone = (value: string | undefined) => {
  const parsed = parseRequiredJson(value, "definition-of-done-json");
  if (!Array.isArray(parsed)) {
    throw new Error("--definition-of-done-json must be a JSON array");
  }
  return parsed.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Invalid --definition-of-done-json criterion");
    }
    if (Object.keys(entry).some((key) => !["id", "criterion", "evidenceRequired"].includes(key))) {
      throw new Error("Invalid --definition-of-done-json criterion fields");
    }
    const id = "id" in entry ? entry.id : undefined;
    const criterion = "criterion" in entry ? entry.criterion : undefined;
    const evidenceRequired = "evidenceRequired" in entry ? entry.evidenceRequired : undefined;
    if (typeof id !== "string" || typeof criterion !== "string" || typeof evidenceRequired !== "boolean") {
      throw new Error("Invalid --definition-of-done-json criterion");
    }
    return { id, criterion, evidenceRequired };
  });
};

const parseDodEvidence = (value: string | undefined) => {
  const parsed = value === undefined ? [] : parseRequiredJson(value, "dod-evidence-json");
  if (!Array.isArray(parsed)) {
    throw new Error("--dod-evidence-json must be a JSON array");
  }
  return parsed.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Invalid --dod-evidence-json binding");
    }
    if (Object.keys(entry).some((key) => !["locator", "covers"].includes(key))) {
      throw new Error("Invalid --dod-evidence-json binding fields");
    }
    const rawLocator = "locator" in entry ? entry.locator : undefined;
    const covers = "covers" in entry ? entry.covers : undefined;
    if (typeof rawLocator !== "string" || !Array.isArray(covers) || covers.some((id) => typeof id !== "string")) {
      throw new Error("Invalid --dod-evidence-json binding");
    }
    const locator = parseWorkItemLocatorString(rawLocator);
    if (locator.type !== "session-note" && locator.type !== "verification-result") {
      throw new Error("Invalid --dod-evidence-json locator");
    }
    return { locator, covers: covers.filter((id): id is string => typeof id === "string") };
  });
};

const parseOptionalWorkItemStatus = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  if (!isWorkItemDocumentStatus(value)) {
    throw new Error(`Invalid --status value: ${value}`);
  }

  return value;
};

const parseOptionalWorkItemState = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  if (!isWorkItemState(value)) {
    throw new Error(`Invalid --work-item-state value: ${value}`);
  }

  return value;
};

const parseDependencyList = (
  value: string | undefined,
): WorkItemRecordLocator[] => {
  return parseList(value).map((entry) => {
    const locator = parseWorkItemLocatorString(entry);
    if (locator.type !== "work-item") {
      throw new Error(`Invalid --dependencies locator: ${entry}`);
    }

    return locator;
  });
};

const parseContextList = (value: string | undefined): WorkItemContextLocator[] => {
  return parseList(value).map((entry) => {
    const locator = parseWorkItemLocatorString(entry);
    if (
      locator.type !== "decision"
      && locator.type !== "canonical-doc"
      && locator.type !== "session-note"
    ) {
      throw new Error(`Invalid --context locator: ${entry}`);
    }

    return locator;
  });
};

const parseEvidenceList = (value: string | undefined): WorkItemEvidenceLocator[] => {
  return parseList(value).map((entry) => {
    const locator = parseWorkItemLocatorString(entry);
    if (locator.type !== "verification-result" && locator.type !== "session-note") {
      throw new Error(`Invalid --evidence locator: ${entry}`);
    }

    return locator;
  });
};

const parseOrigin = (flags: Record<string, string>): WorkItemOrigin => {
  const originKind = requireFlag(flags, "origin-kind");
  if (!isWorkItemOriginKind(originKind)) {
    throw new Error(`Invalid --origin-kind value: ${originKind}`);
  }

  if (originKind === "ad-hoc") {
    return {
      kind: "ad-hoc" as const,
      note: requireFlag(flags, "origin-note"),
    };
  }

  const originLocator = parseWorkItemLocatorString(requireFlag(flags, "origin-locator"));
  if (originLocator.type !== originKind) {
    throw new Error(`--origin-locator must use locator type ${originKind}`);
  }

  if (originLocator.type === "decision") {
    return {
      kind: "decision",
      locator: originLocator,
    };
  }

  return {
    kind: "session-note",
    locator: originLocator,
  };
};

/**
 * Handles the `upsert-work-item` CLI command.
 */
export const upsertWorkItemCommand: CliCommandHandler = (flags, io) => {
  printJson(
    upsertWorkItem({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      summary: requireFlag(flags, "summary"),
      outcome: requireFlag(flags, "outcome"),
      origin: parseOrigin(flags),
      dependencies: parseDependencyList(flags.dependencies),
      context: parseContextList(flags.context),
      verification: parseList(flags.verification),
      evidence: parseEvidenceList(flags.evidence),
      definitionOfDone: parseDefinitionOfDone(flags["definition-of-done-json"]),
      dodEvidence: parseDodEvidence(flags["dod-evidence-json"]),
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalWorkItemStatus(flags.status),
      workItemState: parseOptionalWorkItemState(flags["work-item-state"]),
      date: flags.date,
    }),
    io,
  );
};
