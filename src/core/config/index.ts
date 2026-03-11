import path from "node:path";
import { fileURLToPath } from "node:url";

import { DocumentSourceValues, DocumentStatusValues } from "../types/index.ts";
import type { RepositoryContext, RepositoryContextOptions } from "../types/index.ts";

const detectToolRootDir = (): string => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../");
};

const detectMemoryRootDir = (): string => {
  if (process.env.PROJECT_MEMORY_ROOT) {
    return path.resolve(process.env.PROJECT_MEMORY_ROOT);
  }

  throw new Error(
    "PROJECT_MEMORY_ROOT is required. Set it to an external memory repository before using the CLI or MCP server.",
  );
};

/**
 * Creates the shared repository context used by core modules.
 */
export const createRepositoryContext = (
  options: RepositoryContextOptions = {},
): RepositoryContext => {
  const toolRootDir = path.resolve(options.toolRootDir ?? detectToolRootDir());
  const memoryRootDir = path.resolve(options.memoryRootDir ?? detectMemoryRootDir());

  return {
    toolRootDir,
    memoryRootDir,
    projectsDir: path.join(memoryRootDir, "projects"),
    archivesDir: path.join(memoryRootDir, "archives"),
    templatesDir: path.join(toolRootDir, "templates"),
    allowedSources: [...DocumentSourceValues],
    allowedStatuses: [...DocumentStatusValues],
    maxDocumentBytes: 50_000,
  };
};
