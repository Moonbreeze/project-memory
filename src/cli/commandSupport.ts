import {
  isDocumentSource,
  isDocumentStatus,
  isDocumentType,
} from "../core/index.ts";
import type {
  DocumentSource,
  DocumentStatus,
  DocumentType,
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
 * Writes a JSON result to a provided stdout stream.
 */
export const printJson = (value: unknown, io: CliIo): void => {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
