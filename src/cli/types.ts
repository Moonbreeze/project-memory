/**
 * Parsed CLI command name and flags.
 */
export type ParsedArgs = {
  /** Requested command name. */
  command?: string;
  /** Parsed `--flag value` pairs. */
  flags: Record<string, string>;
};

/**
 * Optional execution context for embedded CLI callers.
 */
export type CliExecutionContext = {
  /** Optional tool-repository root override for commands that write local install artifacts. */
  toolRootDir?: string;
};

/**
 * Output streams used by the CLI dispatch layer.
 */
export type CliIo = {
  /** Standard output sink. */
  stdout: {
    /** Writes one text chunk to stdout. */
    write: (chunk: string) => void;
  };
  /** Standard error sink. */
  stderr: {
    /** Writes one text chunk to stderr. */
    write: (chunk: string) => void;
  };
  /** Optional execution context used by tests and embedded callers. */
  context?: CliExecutionContext;
};

/**
 * CLI command handler signature.
 */
export type CliCommandHandler = (
  flags: Record<string, string>,
  io: CliIo,
) => Promise<void> | void;
