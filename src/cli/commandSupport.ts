import {
  isDocumentSource,
  isDocumentStatus,
  isDocumentType,
  isListDocumentsPreset,
  isListDocumentsSortField,
  parseBooleanString,
  isStableGuidanceReview,
  isSortOrder,
} from "../core/index.ts";
import type {
  DocumentSource,
  DocumentStatus,
  DocumentType,
  ListDocumentsPreset,
  ListDocumentsSortField,
  StableGuidanceReview,
  SortOrder,
} from "../core/index.ts";
import type { CliIo, ParsedArgs } from "./types.ts";

/**
 * Parses raw CLI tokens into a command name and `--flag value` map.
 */
export const parseArgs = (argv: string[]): ParsedArgs => {
  const [command, ...rest] = argv;
  const flags: Record<string, string> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      flags[key] = "true";
      continue;
    }

    flags[key] = value;
    index += 1;
  }

  return { command, flags };
};

/**
 * Reads a required CLI flag or throws with a helpful error.
 */
export const requireFlag = (flags: Record<string, string>, key: string): string => {
  const value = flags[key];
  if (!value) {
    throw new Error(`Missing required flag --${key}`);
  }

  return value;
};

/**
 * Splits a pipe-delimited CLI list into trimmed string items.
 */
export const parseList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

/**
 * Parses one required JSON object or array flag.
 */
export const parseRequiredJson = (value: string | undefined, key: string): unknown => {
  if (!value) {
    throw new Error(`Missing required flag --${key}`);
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid --${key} JSON payload`);
  }
};

/**
 * Parses an optional document source flag.
 */
export const parseOptionalDocumentSource = (
  value: string | undefined,
): DocumentSource | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isDocumentSource(value)) {
    throw new Error(`Invalid --source value: ${value}`);
  }

  return value;
};

/**
 * Parses an optional document status flag.
 */
export const parseOptionalDocumentStatus = (
  value: string | undefined,
): DocumentStatus | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isDocumentStatus(value)) {
    throw new Error(`Invalid --status value: ${value}`);
  }

  return value;
};

/**
 * Parses an optional decision stable-guidance review outcome flag.
 */
export const parseOptionalStableGuidanceReview = (
  value: string | undefined,
): StableGuidanceReview | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isStableGuidanceReview(value)) {
    throw new Error(`Invalid --stable-guidance-review value: ${value}`);
  }

  return value;
};

/**
 * Parses an optional document type flag.
 */
export const parseOptionalDocumentType = (
  value: string | undefined,
): DocumentType | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isDocumentType(value)) {
    throw new Error(`Invalid --type value: ${value}`);
  }

  return value;
};

/**
 * Parses an optional numeric limit flag.
 */
export const parseOptionalLimit = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Invalid --limit value: ${value}`);
  }

  return numericValue;
};

/**
 * Parses an optional boolean flag encoded as `true` or `false`.
 */
export const parseOptionalBoolean = (
  value: string | undefined,
  key: string,
): boolean | undefined => {
  try {
    return parseBooleanString(value);
  } catch {
    throw new Error(`Invalid --${key} value: ${value}`);
  }
};

/**
 * Parses an optional pipe-delimited document-status list.
 */
export const parseOptionalDocumentStatusList = (
  value: string | undefined,
): DocumentStatus[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const entries = parseList(value);
  if (entries.length === 0) {
    throw new Error("Invalid --exclude-status value: expected one or more statuses");
  }

  const statuses: DocumentStatus[] = [];
  for (const entry of entries) {
    if (!isDocumentStatus(entry)) {
      throw new Error(`Invalid --exclude-status value: ${value}`);
    }

    statuses.push(entry);
  }

  return statuses;
};

/**
 * Parses an optional list-documents preset flag.
 */
export const parseOptionalListDocumentsPreset = (
  value: string | undefined,
): ListDocumentsPreset | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isListDocumentsPreset(value)) {
    throw new Error(`Invalid --preset value: ${value}`);
  }

  return value;
};

/**
 * Parses an optional list-documents sort flag.
 */
export const parseOptionalListDocumentsSortField = (
  value: string | undefined,
): ListDocumentsSortField | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isListDocumentsSortField(value)) {
    throw new Error(`Invalid --sort value: ${value}`);
  }

  return value;
};

/**
 * Parses an optional sort-order flag.
 */
export const parseOptionalSortOrder = (
  value: string | undefined,
): SortOrder | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isSortOrder(value)) {
    throw new Error(`Invalid --order value: ${value}`);
  }

  return value;
};

/**
 * Writes a JSON result to a provided stdout stream.
 */
export const printJson = (value: unknown, io: CliIo): void => {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
