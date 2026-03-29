import fs from "node:fs";

import { startWebServer } from "./server.ts";

try {
  const server = await startWebServer();
  const address = server.address();
  const readyFilePath = process.env.PROJECT_MEMORY_WEB_READY_FILE?.trim();
  if (readyFilePath) {
    fs.writeFileSync(
      readyFilePath,
      `${JSON.stringify({ startedAt: new Date().toISOString() })}\n`,
      "utf8",
    );
  }
  if (address && typeof address === "object") {
    process.stdout.write(`Project Memory Web listening on http://${address.address}:${address.port}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
