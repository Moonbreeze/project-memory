import {
  isTaxonomyRegistryEntryState,
  isTaxonomyRegistryMigrationKind,
  isRecord,
  upsertTaxonomyRegistry,
} from "../../core/index.ts";
import type { TaxonomyRegistryEntry } from "../../core/index.ts";
import { parseList, parseOptionalDocumentSource, parseRequiredJson, printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

/**
 * Parses the `--entries` registry payload from JSON.
 */
const parseRegistryEntries = (value: unknown): TaxonomyRegistryEntry[] => {
  if (!Array.isArray(value)) {
    throw new Error("Invalid --entries JSON payload");
  }

  return value.map((entry) => {
    if (
      !isRecord(entry)
      || typeof entry.scope !== "string"
      || typeof entry.topic !== "string"
      || typeof entry.state !== "string"
      || typeof entry.migration !== "string"
      || !Array.isArray(entry.aliases)
      || entry.aliases.some((alias) => typeof alias !== "string")
      || !Array.isArray(entry.mappedScopes)
      || entry.mappedScopes.some((scope) => typeof scope !== "string")
    ) {
      throw new Error("Invalid --entries JSON payload");
    }

    if (!isTaxonomyRegistryEntryState(entry.state) || !isTaxonomyRegistryMigrationKind(entry.migration)) {
      throw new Error("Invalid --entries JSON payload");
    }

    return {
      scope: entry.scope,
      topic: entry.topic,
      state: entry.state,
      migration: entry.migration,
      aliases: entry.aliases,
      mappedScopes: entry.mappedScopes,
    };
  });
};

/**
 * Handles the `upsert-taxonomy-registry` CLI command.
 */
export const upsertTaxonomyRegistryCommand: CliCommandHandler = (flags, io) => {
  printJson(
    upsertTaxonomyRegistry({
      project: requireFlag(flags, "project"),
      date: flags.date,
      source: parseOptionalDocumentSource(flags.source),
      summary: flags.summary,
      references: parseList(flags.references),
      entries: parseRegistryEntries(parseRequiredJson(flags.entries, "entries")),
    }),
    io,
  );
};
