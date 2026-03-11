import { cliCommandHandlers } from "./commands/index.ts";
import { parseArgs } from "./commandSupport.ts";
import type { CliIo } from "./types.ts";

/**
 * Executes one CLI command against the shared core.
 */
export const runCli = async (
  argv: string[],
  io: CliIo = {
    stdout: process.stdout,
    stderr: process.stderr,
  },
): Promise<void> => {
  const { command, flags } = parseArgs(argv);

  if (!command) {
    throw new Error("Missing command");
  }

  const handler = cliCommandHandlers[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }

  await handler(flags, io);
};
