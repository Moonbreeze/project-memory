import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../../src/cli/dispatch.ts";
import { createCapturedIo, parseLastJson } from "../fixtures/cliTestSupport.ts";
import { setupTestRepo } from "../fixtures/setupTestRepo.ts";
import { findFreePort, isRecord } from "../fixtures/testSupport.ts";

test("CLI web-start/web-status/web-stop manage the shared Web runtime", async () => {
  const rootDir = setupTestRepo();
  const port = await findFreePort();
  const previousMemoryRoot = process.env.PROJECT_MEMORY_ROOT;
  process.env.PROJECT_MEMORY_ROOT = rootDir;

  const startCapture = createCapturedIo();
  const statusCapture = createCapturedIo();
  const stopCapture = createCapturedIo();

  try {
    await runCli(
      [
        "web-start",
        "--host",
        "127.0.0.1",
        "--port",
        `${port}`,
        "--public-base-url",
        "https://example.com/project-memory",
        "--prompt-public-url",
        "false",
      ],
      startCapture.io,
    );

    const started = parseLastJson(startCapture.captured.stdout);
    if (
      !isRecord(started)
      || started.state !== "running"
      || started.outcome !== "started"
      || !isRecord(started.timelineLinks)
      || typeof started.timelineLinks.public !== "string"
    ) {
      throw new Error("Unexpected web-start result shape");
    }

    assert.equal(started.timelineLinks.public, "https://example.com/project-memory/timeline");

    await runCli(
      [
        "web-status",
        "--host",
        "127.0.0.1",
        "--port",
        `${port}`,
      ],
      statusCapture.io,
    );

    const status = parseLastJson(statusCapture.captured.stdout);
    if (!isRecord(status) || status.state !== "running") {
      throw new Error("Unexpected web-status result shape");
    }

    await runCli(
      [
        "web-stop",
        "--host",
        "127.0.0.1",
        "--port",
        `${port}`,
      ],
      stopCapture.io,
    );

    const stopped = parseLastJson(stopCapture.captured.stdout);
    if (!isRecord(stopped) || stopped.outcome !== "stopped") {
      throw new Error("Unexpected web-stop result shape");
    }
  } finally {
    const cleanupCapture = createCapturedIo();
    await runCli(
      [
        "web-stop",
        "--host",
        "127.0.0.1",
        "--port",
        `${port}`,
      ],
      cleanupCapture.io,
    ).catch(() => undefined);

    if (previousMemoryRoot === undefined) {
      delete process.env.PROJECT_MEMORY_ROOT;
    } else {
      process.env.PROJECT_MEMORY_ROOT = previousMemoryRoot;
    }
  }
});
