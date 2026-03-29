import fs from "node:fs";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createManagedWebRuntimeFilePath,
  getManagedWebServerStatus,
  startManagedWebServer,
  stopManagedWebServer,
} from "../../src/core/index.ts";
import { createTestRepositoryContext, setupTestRepo } from "../fixtures/setupTestRepo.ts";

const findFreePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve temporary port");
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return address.port;
};

test("managed Web runtime starts idempotently and returns local/public links", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  const port = await findFreePort();

  try {
    const started = startManagedWebServer(
      {
        host: "127.0.0.1",
        port,
        publicBaseUrl: "https://example.com/project-memory",
      },
      context,
    );

    assert.equal(started.outcome, "started");
    assert.equal(started.state, "running");
    assert.equal(started.rootLinks.local, `http://127.0.0.1:${port}/`);
    assert.equal(started.timelineLinks.public, "https://example.com/project-memory/timeline");
    assert.equal(started.publicBaseUrlSource, "override");

    const repeatedStart = startManagedWebServer(
      {
        host: "127.0.0.1",
        port,
        publicBaseUrl: "https://example.com/project-memory",
      },
      context,
    );
    assert.equal(repeatedStart.outcome, "already-running");
    assert.equal(repeatedStart.pid, started.pid);

    const status = getManagedWebServerStatus(
      {
        host: "127.0.0.1",
        port,
      },
      context,
    );
    assert.equal(status.state, "running");
    assert.equal(status.pid, started.pid);
  } finally {
    stopManagedWebServer({ host: "127.0.0.1", port }, context);
  }
});

test("managed Web runtime reports stale state and cleans stale runtime records", async () => {
  const memoryRootDir = setupTestRepo();
  const context = createTestRepositoryContext(memoryRootDir);
  const port = await findFreePort();
  const runtimeFilePath = createManagedWebRuntimeFilePath(
    {
      host: "127.0.0.1",
      port,
    },
    context,
  );

  fs.writeFileSync(
    runtimeFilePath,
    `${JSON.stringify({
      runtimeKey: {
        memoryRootDir: context.memoryRootDir,
        host: "127.0.0.1",
        port,
      },
      pid: 999_999,
      startedAt: "2026-03-29T00:00:00.000Z",
      localBaseUrl: `http://127.0.0.1:${port}`,
    })}\n`,
    "utf8",
  );

  try {
    const status = getManagedWebServerStatus(
      {
        host: "127.0.0.1",
        port,
      },
      context,
    );
    assert.equal(status.state, "stale");
    assert.match(status.staleReason ?? "", /no longer running/);

    const stoppedRuntime = stopManagedWebServer(
      {
        host: "127.0.0.1",
        port,
      },
      context,
    );
    assert.equal(stoppedRuntime.outcome, "already-stopped");
  } finally {
    if (fs.existsSync(runtimeFilePath)) {
      fs.unlinkSync(runtimeFilePath);
    }
  }
});
