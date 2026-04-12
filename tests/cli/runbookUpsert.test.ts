import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../../src/cli/dispatch.ts";
import { setupTestRepo } from "../fixtures/setupTestRepo.ts";

type CapturedIo = {
  stdout: string[];
  stderr: string[];
};

const createCapturedIo = (): {
  io: {
    stdout: { write: (chunk: string) => void };
    stderr: { write: (chunk: string) => void };
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

const parseLastJson = (chunks: string[]): unknown => {
  return JSON.parse(chunks.join("").trim());
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

test("CLI upsert-runbook writes a runbook document", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const capture = createCapturedIo();
  await runCli(
    [
      "upsert-runbook",
      "--project",
      "acme-app",
      "--topic",
      "architecture overview",
      "--purpose",
      "Describe the current architecture.",
      "--procedure",
      "Read the overview",
      "--verification",
      "Confirm the overview is current",
      "--date",
      "2026-03-11",
    ],
    capture.io,
  );

  const result = parseLastJson(capture.captured.stdout);
  if (!isRecord(result) || !isRecord(result.metadata)) {
    throw new Error("Unexpected upsert-runbook result shape");
  }

  assert.equal(result.metadata.topic, "architecture-overview");

  delete process.env.PROJECT_MEMORY_ROOT;
});

test("CLI create-runbook remains a backward-compatible alias", async () => {
  const rootDir = setupTestRepo();
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const capture = createCapturedIo();
  await runCli(
    [
      "create-runbook",
      "--project",
      "acme-app",
      "--topic",
      "legacy runbook alias",
      "--purpose",
      "Exercise the legacy CLI alias.",
      "--procedure",
      "Call the old command name",
      "--verification",
      "Confirm the alias still writes a runbook",
      "--date",
      "2026-03-11",
    ],
    capture.io,
  );

  const result = parseLastJson(capture.captured.stdout);
  if (!isRecord(result) || !isRecord(result.metadata)) {
    throw new Error("Unexpected create-runbook alias result shape");
  }

  assert.equal(result.metadata.topic, "legacy-runbook-alias");

  delete process.env.PROJECT_MEMORY_ROOT;
});
