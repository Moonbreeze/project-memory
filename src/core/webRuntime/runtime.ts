import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import type { RepositoryContext } from "../types/index.ts";

import {
  DefaultWebHost,
  DefaultWebPort,
  GenericWebHostEnvVar,
  GenericWebPortEnvVar,
  ProjectMemoryWebHostEnvVar,
  ProjectMemoryWebPortEnvVar,
  ProjectMemoryWebPublicBaseUrlEnvVar,
  WebRuntimeFilePrefix,
  WebServerStartPollIntervalMs,
  WebServerStartTimeoutMs,
  WebServerStopTimeoutMs,
} from "./constants.ts";
import type {
  ManagedWebServerConfig,
  WebRouteLinkSet,
  WebServerLifecycleInput,
  WebServerRuntimeKey,
  WebServerRuntimeRecord,
  WebServerStartResult,
  WebServerStatusResult,
  WebServerStopResult,
} from "./types.ts";

const WebRootRoutePath = "/";
const WebTimelineRoutePath = "/timeline";
const WebReadyFileEnvVar = "PROJECT_MEMORY_WEB_READY_FILE";
const WildcardIpv4Host = "0.0.0.0";
const WildcardIpv6Host = "::";

const getPreferredEnvValue = (preferredName: string, fallbackName: string): string | undefined => {
  const preferredValue = process.env[preferredName]?.trim();
  if (preferredValue) {
    return preferredValue;
  }

  const fallbackValue = process.env[fallbackName]?.trim();
  if (fallbackValue) {
    return fallbackValue;
  }

  return undefined;
};

const parseWebPort = (rawPort: string): number => {
  const parsedPort = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(
      `${ProjectMemoryWebPortEnvVar}/${GenericWebPortEnvVar} must be an integer between 1 and 65535`,
    );
  }

  return parsedPort;
};

const normalizeOptionalHost = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    throw new Error("Web host override must not be empty");
  }

  return trimmedValue;
};

const normalizePublicBaseUrl = (value: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    throw new Error(`${ProjectMemoryWebPublicBaseUrlEnvVar} must not be empty`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error(`${ProjectMemoryWebPublicBaseUrlEnvVar} must be an absolute http(s) URL`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`${ProjectMemoryWebPublicBaseUrlEnvVar} must use http or https`);
  }

  parsedUrl.hash = "";
  parsedUrl.search = "";
  if (!parsedUrl.pathname.endsWith("/")) {
    parsedUrl.pathname = `${parsedUrl.pathname}/`;
  }

  return parsedUrl.toString().replace(/\/$/, "");
};

const resolvePublicUrlConfig = (
  input: WebServerLifecycleInput,
  bindPort: number,
): ManagedWebServerConfig["publicUrl"] => {
  if (input.publicBaseUrl !== undefined) {
    return {
      publicBaseUrl: normalizePublicBaseUrl(input.publicBaseUrl),
      publicBaseUrlSource: "override",
      publicUrlSuggestion: input.suggestPublicUrl ? suggestPublicBaseUrl(bindPort) : undefined,
    };
  }

  const envValue = process.env[ProjectMemoryWebPublicBaseUrlEnvVar];
  if (envValue?.trim()) {
    return {
      publicBaseUrl: normalizePublicBaseUrl(envValue),
      publicBaseUrlSource: "env",
      publicUrlSuggestion: input.suggestPublicUrl ? suggestPublicBaseUrl(bindPort) : undefined,
    };
  }

  return {
    publicBaseUrlSource: "none",
    publicUrlSuggestion: input.suggestPublicUrl ? suggestPublicBaseUrl(bindPort) : undefined,
  };
};

const resolveBindConfig = (input: WebServerLifecycleInput) => {
  const host = normalizeOptionalHost(input.host)
    ?? getPreferredEnvValue(ProjectMemoryWebHostEnvVar, GenericWebHostEnvVar)
    ?? DefaultWebHost;

  const port = input.port
    ?? (() => {
      const rawPort = getPreferredEnvValue(ProjectMemoryWebPortEnvVar, GenericWebPortEnvVar);
      return rawPort ? parseWebPort(rawPort) : DefaultWebPort;
    })();

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Web port override must be an integer between 1 and 65535");
  }

  return { host, port };
};

const createRuntimeKey = (
  context: RepositoryContext,
  input: WebServerLifecycleInput,
): WebServerRuntimeKey => {
  const bind = resolveBindConfig(input);
  return {
    memoryRootDir: context.memoryRootDir,
    host: bind.host,
    port: bind.port,
  };
};

const createRuntimeKeyDigest = (runtimeKey: WebServerRuntimeKey): string => {
  return createHash("sha256")
    .update(JSON.stringify(runtimeKey))
    .digest("hex")
    .slice(0, 16);
};

const createRuntimeFilePath = (runtimeKey: WebServerRuntimeKey): string => {
  const digest = createRuntimeKeyDigest(runtimeKey);
  return path.join(os.tmpdir(), `${WebRuntimeFilePrefix}-${digest}.json`);
};

const ensureRuntimeDirectory = (runtimeFilePath: string): void => {
  fs.mkdirSync(path.dirname(runtimeFilePath), { recursive: true });
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && (error.code === "ESRCH" || error.code === "ENOENT")
    ) {
      return false;
    }

    throw error;
  }
};

const readRuntimeRecord = (
  runtimeFilePath: string,
): WebServerRuntimeRecord | undefined => {
  if (!fs.existsSync(runtimeFilePath)) {
    return undefined;
  }

  const rawValue = fs.readFileSync(runtimeFilePath, "utf8");
  const parsedValue = JSON.parse(rawValue);
  if (
    typeof parsedValue !== "object"
    || parsedValue === null
    || typeof parsedValue.pid !== "number"
    || typeof parsedValue.startedAt !== "string"
    || typeof parsedValue.localBaseUrl !== "string"
    || typeof parsedValue.runtimeKey !== "object"
    || parsedValue.runtimeKey === null
    || typeof parsedValue.runtimeKey.memoryRootDir !== "string"
    || typeof parsedValue.runtimeKey.host !== "string"
    || typeof parsedValue.runtimeKey.port !== "number"
  ) {
    throw new Error(`Invalid Web runtime file: ${runtimeFilePath}`);
  }

  return {
    pid: parsedValue.pid,
    startedAt: parsedValue.startedAt,
    localBaseUrl: parsedValue.localBaseUrl,
    runtimeKey: {
      memoryRootDir: parsedValue.runtimeKey.memoryRootDir,
      host: parsedValue.runtimeKey.host,
      port: parsedValue.runtimeKey.port,
    },
  };
};

const writeRuntimeRecord = (
  runtimeFilePath: string,
  record: WebServerRuntimeRecord,
): void => {
  ensureRuntimeDirectory(runtimeFilePath);
  fs.writeFileSync(runtimeFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
};

const removeRuntimeRecord = (runtimeFilePath: string): void => {
  if (fs.existsSync(runtimeFilePath)) {
    fs.unlinkSync(runtimeFilePath);
  }
};

const formatUrlHost = (host: string): string => {
  const normalizedHost = host.replace(/^\[(.*)\]$/, "$1");
  if (normalizedHost.includes(":")) {
    return `[${normalizedHost}]`;
  }

  return normalizedHost;
};

const resolveLocalNavigationHost = (host: string): string => {
  const normalizedHost = host.replace(/^\[(.*)\]$/, "$1");
  if (normalizedHost === WildcardIpv4Host || normalizedHost === WildcardIpv6Host) {
    return "127.0.0.1";
  }

  return normalizedHost;
};

const createBaseUrl = (host: string, port: number): string => {
  return `http://${formatUrlHost(host)}:${port}`;
};

const createRouteUrl = (baseUrl: string, routePath: string): string => {
  const relativePath = routePath.startsWith("/") ? routePath.slice(1) : routePath;
  return new URL(relativePath, `${baseUrl}/`).toString();
};

const createRouteLinkSet = (
  localBaseUrl: string,
  publicBaseUrl: string | undefined,
  routePath: string,
): WebRouteLinkSet => {
  return {
    local: createRouteUrl(localBaseUrl, routePath),
    public: publicBaseUrl ? createRouteUrl(publicBaseUrl, routePath) : undefined,
  };
};

const createStatusResult = (
  config: ManagedWebServerConfig,
  state: WebServerStatusResult["state"],
  extra: {
    pid?: number;
    startedAt?: string;
    staleReason?: string;
  } = {},
): WebServerStatusResult => {
  const runtimeKey = createRuntimeKey(config.context, config.bind);
  const localBaseUrl = createBaseUrl(resolveLocalNavigationHost(config.bind.host), config.bind.port);

  return {
    state,
    runtimeKey,
    bind: config.bind,
    localBaseUrl,
    publicBaseUrl: config.publicUrl.publicBaseUrl,
    publicBaseUrlSource: config.publicUrl.publicBaseUrlSource,
    publicUrlSuggestion: config.publicUrl.publicUrlSuggestion,
    pid: extra.pid,
    startedAt: extra.startedAt,
    staleReason: extra.staleReason,
    rootLinks: createRouteLinkSet(localBaseUrl, config.publicUrl.publicBaseUrl, WebRootRoutePath),
    timelineLinks: createRouteLinkSet(
      localBaseUrl,
      config.publicUrl.publicBaseUrl,
      WebTimelineRoutePath,
    ),
  };
};

const sleepSync = (durationMs: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
};

const pollUntil = (
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs: number,
): boolean => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return true;
    }

    sleepSync(intervalMs);
  }

  return false;
};

const stopProcess = (pid: number): boolean => {
  if (!isProcessAlive(pid)) {
    return false;
  }

  process.kill(pid, "SIGTERM");
  const stoppedAfterTerm = pollUntil(() => !isProcessAlive(pid), WebServerStopTimeoutMs, 100);
  if (stoppedAfterTerm) {
    return true;
  }

  process.kill(pid, "SIGKILL");
  pollUntil(() => !isProcessAlive(pid), 1_000, 100);
  return true;
};

const suggestPublicBaseUrl = (port: number): string | undefined => {
  const digResult = spawnSync(
    "dig",
    ["+short", "myip.opendns.com", "@resolver1.opendns.com"],
    {
      encoding: "utf8",
      timeout: 1_500,
    },
  );

  if (digResult.error || digResult.status !== 0) {
    return undefined;
  }

  const address = digResult.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .find(Boolean);
  if (!address) {
    return undefined;
  }

  return `http://${address}:${port}`;
};

const createReadyFilePath = (runtimeFilePath: string): string => {
  return `${runtimeFilePath}.ready`;
};

const readReadyFileStartedAt = (readyFilePath: string): string => {
  const rawValue = fs.readFileSync(readyFilePath, "utf8");
  const parsedValue = JSON.parse(rawValue);
  if (
    typeof parsedValue !== "object"
    || parsedValue === null
    || typeof parsedValue.startedAt !== "string"
  ) {
    throw new Error(`Invalid Web ready file: ${readyFilePath}`);
  }

  return parsedValue.startedAt;
};

const spawnManagedWebProcess = (
  config: ManagedWebServerConfig,
  runtimeFilePath: string,
): WebServerRuntimeRecord => {
  const entryPointPath = path.join(config.context.toolRootDir, "src", "web", "index.ts");
  const readyFilePath = createReadyFilePath(runtimeFilePath);
  removeRuntimeRecord(readyFilePath);
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", entryPointPath],
    {
      cwd: config.context.toolRootDir,
      detached: true,
      env: {
        ...process.env,
        PROJECT_MEMORY_ROOT: config.context.memoryRootDir,
        [ProjectMemoryWebHostEnvVar]: config.bind.host,
        [ProjectMemoryWebPortEnvVar]: String(config.bind.port),
        [WebReadyFileEnvVar]: readyFilePath,
      },
      stdio: "ignore",
    },
  );
  child.unref();

  if (child.pid === undefined) {
    throw new Error("Failed to determine PID for spawned Web server process");
  }

  const started = pollUntil(
    () => fs.existsSync(readyFilePath),
    WebServerStartTimeoutMs,
    WebServerStartPollIntervalMs,
  );
  if (!started) {
    if (isProcessAlive(child.pid)) {
      stopProcess(child.pid);
    }

    removeRuntimeRecord(readyFilePath);
    throw new Error(`Timed out waiting for the Web server to start on ${config.bind.host}:${config.bind.port}`);
  }

  const localHost = resolveLocalNavigationHost(config.bind.host);
  const startedAt = readReadyFileStartedAt(readyFilePath);
  removeRuntimeRecord(readyFilePath);

  return {
    runtimeKey: createRuntimeKey(config.context, config.bind),
    pid: child.pid,
    startedAt,
    localBaseUrl: createBaseUrl(localHost, config.bind.port),
  };
};

/**
 * Resolves one shared-core Web lifecycle configuration from repository context,
 * explicit overrides, and environment defaults.
 */
export const resolveManagedWebServerConfig = (
  input: WebServerLifecycleInput = {},
  context: RepositoryContext,
): ManagedWebServerConfig => {
  const bind = resolveBindConfig(input);
  return {
    context,
    bind,
    publicUrl: resolvePublicUrlConfig(input, bind.port),
  };
};

/**
 * Returns one local/public route-link pair for a resolved lifecycle status.
 */
export const createManagedWebRouteLinks = (
  result: Pick<WebServerStatusResult, "localBaseUrl" | "publicBaseUrl">,
  routePath: string,
): WebRouteLinkSet => {
  return createRouteLinkSet(result.localBaseUrl, result.publicBaseUrl, routePath);
};

/**
 * Returns the ephemeral runtime-record path for one managed Web runtime key.
 */
export const createManagedWebRuntimeFilePath = (
  input: WebServerLifecycleInput = {},
  context: RepositoryContext,
): string => {
  return createRuntimeFilePath(createRuntimeKey(context, input));
};

/**
 * Reads the current status of one managed Web server runtime.
 */
export const getManagedWebServerStatus = (
  input: WebServerLifecycleInput = {},
  context: RepositoryContext,
): WebServerStatusResult => {
  const config = resolveManagedWebServerConfig(input, context);
  const runtimeKey = createRuntimeKey(config.context, config.bind);
  const runtimeFilePath = createRuntimeFilePath(runtimeKey);

  let record: WebServerRuntimeRecord | undefined;
  try {
    record = readRuntimeRecord(runtimeFilePath);
  } catch (error) {
    removeRuntimeRecord(runtimeFilePath);
    return createStatusResult(config, "stale", {
      staleReason: error instanceof Error ? error.message : String(error),
    });
  }

  if (!record) {
    return createStatusResult(config, "stopped");
  }

  if (!isProcessAlive(record.pid)) {
    removeRuntimeRecord(runtimeFilePath);
    return createStatusResult(config, "stale", {
      staleReason: `Recorded Web process ${record.pid} is no longer running`,
    });
  }

  return createStatusResult(config, "running", {
    pid: record.pid,
    startedAt: record.startedAt,
  });
};

/**
 * Starts one managed Web server runtime or returns the existing singleton instance.
 */
export const startManagedWebServer = (
  input: WebServerLifecycleInput = {},
  context: RepositoryContext,
): WebServerStartResult => {
  const config = resolveManagedWebServerConfig(input, context);
  const runtimeKey = createRuntimeKey(config.context, config.bind);
  const runtimeFilePath = createRuntimeFilePath(runtimeKey);
  const currentStatus = getManagedWebServerStatus(input, context);
  if (currentStatus.state === "running") {
    return {
      ...currentStatus,
      outcome: "already-running",
    };
  }

  const recoveredStaleRuntime = currentStatus.state === "stale";
  removeRuntimeRecord(runtimeFilePath);
  const record = spawnManagedWebProcess(config, runtimeFilePath);
  writeRuntimeRecord(runtimeFilePath, record);

  const startedStatus = getManagedWebServerStatus(input, context);
  return {
    ...startedStatus,
    outcome: recoveredStaleRuntime ? "recovered-stale-and-started" : "started",
  };
};

/**
 * Stops one managed Web server runtime and cleans any stale singleton record.
 */
export const stopManagedWebServer = (
  input: WebServerLifecycleInput = {},
  context: RepositoryContext,
): WebServerStopResult => {
  const config = resolveManagedWebServerConfig(input, context);
  const runtimeKey = createRuntimeKey(config.context, config.bind);
  const runtimeFilePath = createRuntimeFilePath(runtimeKey);
  const currentStatus = getManagedWebServerStatus(input, context);

  if (currentStatus.state === "stopped") {
    return {
      outcome: "already-stopped",
      runtimeKey,
      bind: currentStatus.bind,
      localBaseUrl: currentStatus.localBaseUrl,
      publicBaseUrl: currentStatus.publicBaseUrl,
      publicBaseUrlSource: currentStatus.publicBaseUrlSource,
      publicUrlSuggestion: currentStatus.publicUrlSuggestion,
      rootLinks: currentStatus.rootLinks,
      timelineLinks: currentStatus.timelineLinks,
    };
  }

  if (currentStatus.state === "stale") {
    removeRuntimeRecord(runtimeFilePath);
    return {
      outcome: "cleaned-stale-runtime",
      runtimeKey,
      bind: currentStatus.bind,
      localBaseUrl: currentStatus.localBaseUrl,
      publicBaseUrl: currentStatus.publicBaseUrl,
      publicBaseUrlSource: currentStatus.publicBaseUrlSource,
      publicUrlSuggestion: currentStatus.publicUrlSuggestion,
      rootLinks: currentStatus.rootLinks,
      timelineLinks: currentStatus.timelineLinks,
      staleReason: currentStatus.staleReason,
    };
  }

  if (currentStatus.pid !== undefined) {
    stopProcess(currentStatus.pid);
  }
  removeRuntimeRecord(runtimeFilePath);

  return {
    outcome: "stopped",
    runtimeKey,
    bind: currentStatus.bind,
    localBaseUrl: currentStatus.localBaseUrl,
    publicBaseUrl: currentStatus.publicBaseUrl,
    publicBaseUrlSource: currentStatus.publicBaseUrlSource,
    publicUrlSuggestion: currentStatus.publicUrlSuggestion,
    rootLinks: currentStatus.rootLinks,
    timelineLinks: currentStatus.timelineLinks,
  };
};
