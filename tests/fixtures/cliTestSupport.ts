type CapturedIo = {
  stdout: string[];
  stderr: string[];
};

/**
 * Creates in-memory stdout and stderr collectors for CLI tests.
 */
export const createCapturedIo = (): {
  io: {
    stdout: { write: (chunk: string) => void };
    stderr: { write: (chunk: string) => void };
    context?: { toolRootDir?: string };
  };
  captured: CapturedIo;
} => {
  const captured: CapturedIo = {
    stdout: [],
    stderr: [],
  };

  return {
    io: {
      stdout: {
        write: (chunk: string) => {
          captured.stdout.push(chunk);
        },
      },
      stderr: {
        write: (chunk: string) => {
          captured.stderr.push(chunk);
        },
      },
    },
    captured,
  };
};

/**
 * Parses the last JSON payload written by the CLI.
 */
export const parseLastJson = (chunks: string[]): unknown => {
  const payload = chunks.join("").trim();
  return JSON.parse(payload);
};
