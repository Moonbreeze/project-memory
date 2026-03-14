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
  parseOptionalDocumentSource,
  printJson,
  requireFlag,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

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
      source: parseOptionalDocumentSource(flags.source),
      status: parseOptionalWorkItemStatus(flags.status),
      workItemState: parseOptionalWorkItemState(flags["work-item-state"]),
      date: flags.date,
    }),
    io,
  );
};
