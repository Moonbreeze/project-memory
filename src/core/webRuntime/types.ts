import type { RepositoryContext } from "../types/index.ts";

/**
 * Public URL source values reported by Web lifecycle results.
 */
const WebServerPublicUrlSource = ["env", "override", "none"] as const;

/**
 * One reported public URL source value.
 */
export type WebServerPublicUrlSource = typeof WebServerPublicUrlSource[number];

/**
 * Returns `true` when `value` is a supported Web public URL source.
 */
export const isWebServerPublicUrlSource = (
  value: unknown,
): value is WebServerPublicUrlSource => {
  return typeof value === "string" && WebServerPublicUrlSource.includes(value as WebServerPublicUrlSource);
};

/**
 * Lifecycle states reported by the managed Web runtime.
 */
const WebServerLifecycleState = ["running", "stopped", "stale"] as const;

/**
 * One managed Web runtime lifecycle state.
 */
export type WebServerLifecycleState = typeof WebServerLifecycleState[number];

/**
 * Returns `true` when `value` is a supported Web lifecycle state.
 */
export const isWebServerLifecycleState = (
  value: unknown,
): value is WebServerLifecycleState => {
  return typeof value === "string" && WebServerLifecycleState.includes(value as WebServerLifecycleState);
};

/**
 * Outcome values returned by `startManagedWebServer`.
 */
const WebServerStartOutcome = [
  "started",
  "already-running",
  "recovered-stale-and-started",
] as const;

/**
 * One start outcome reported by the managed Web runtime.
 */
export type WebServerStartOutcome = typeof WebServerStartOutcome[number];

/**
 * Returns `true` when `value` is a supported Web start outcome.
 */
export const isWebServerStartOutcome = (
  value: unknown,
): value is WebServerStartOutcome => {
  return typeof value === "string" && WebServerStartOutcome.includes(value as WebServerStartOutcome);
};

/**
 * Outcome values returned by `stopManagedWebServer`.
 */
const WebServerStopOutcome = [
  "stopped",
  "already-stopped",
  "cleaned-stale-runtime",
] as const;

/**
 * One stop outcome reported by the managed Web runtime.
 */
export type WebServerStopOutcome = typeof WebServerStopOutcome[number];

/**
 * Returns `true` when `value` is a supported Web stop outcome.
 */
export const isWebServerStopOutcome = (
  value: unknown,
): value is WebServerStopOutcome => {
  return typeof value === "string" && WebServerStopOutcome.includes(value as WebServerStopOutcome);
};

/**
 * Bind configuration used for one managed Web runtime instance.
 */
export type WebServerBindConfig = {
  /** Network host used by the Web server. */
  host: string;
  /** Network port used by the Web server. */
  port: number;
};

/**
 * Public-link configuration resolved for one lifecycle call.
 */
export type WebServerPublicUrlConfig = {
  /** Optional public base URL used for external links. */
  publicBaseUrl?: string;
  /** Reporting-only source describing where the public URL came from. */
  publicBaseUrlSource: WebServerPublicUrlSource;
  /** Optional candidate suggestion discovered outside configuration truth. */
  publicUrlSuggestion?: string;
};

/**
 * Shared-core lifecycle configuration for the managed Web runtime.
 */
export type ManagedWebServerConfig = {
  /** Repository context that owns the target memory root. */
  context: RepositoryContext;
  /** Resolved bind configuration. */
  bind: WebServerBindConfig;
  /** Resolved public-link configuration. */
  publicUrl: WebServerPublicUrlConfig;
};

/**
 * Optional lifecycle input overrides for `start`, `status`, and `stop`.
 */
export type WebServerLifecycleInput = {
  /** Optional host override. */
  host?: string;
  /** Optional port override. */
  port?: number;
  /** Optional explicit public base URL override. */
  publicBaseUrl?: string;
  /** Optional flag that enables a best-effort public URL suggestion. */
  suggestPublicUrl?: boolean;
};

/**
 * Stable singleton key for one managed Web runtime instance.
 */
export type WebServerRuntimeKey = {
  /** Absolute memory-repository root backing the runtime instance. */
  memoryRootDir: string;
  /** Bound host used for the runtime instance. */
  host: string;
  /** Bound port used for the runtime instance. */
  port: number;
};

/**
 * One runtime-record file persisted outside the memory repository.
 */
export type WebServerRuntimeRecord = {
  /** Singleton key for the managed runtime instance. */
  runtimeKey: WebServerRuntimeKey;
  /** Spawned process identifier. */
  pid: number;
  /** Start timestamp recorded after readiness succeeds. */
  startedAt: string;
  /** Stable local base URL used for same-machine navigation. */
  localBaseUrl: string;
};

/**
 * One resolved local/public URL pair for a route.
 */
export type WebRouteLinkSet = {
  /** Same-machine URL derived from the local bind configuration. */
  local: string;
  /** Optional public URL derived from configured public base URL. */
  public?: string;
};

/**
 * Common fields returned by Web lifecycle status operations.
 */
export type WebServerStatusResult = {
  /** Stable lifecycle state for the requested runtime key. */
  state: WebServerLifecycleState;
  /** Resolved singleton key for this lifecycle query. */
  runtimeKey: WebServerRuntimeKey;
  /** Current bind configuration. */
  bind: WebServerBindConfig;
  /** Stable local base URL for same-machine links. */
  localBaseUrl: string;
  /** Optional public base URL for external links. */
  publicBaseUrl?: string;
  /** Reporting-only source of the current public base URL. */
  publicBaseUrlSource: WebServerPublicUrlSource;
  /** Optional best-effort public URL candidate. */
  publicUrlSuggestion?: string;
  /** Optional running process identifier. */
  pid?: number;
  /** Optional start timestamp when the runtime is known to be running. */
  startedAt?: string;
  /** Optional stale-state explanation when the runtime record is invalid. */
  staleReason?: string;
  /** Root route URLs for current local/public projections. */
  rootLinks: WebRouteLinkSet;
  /** Timeline route URLs for current local/public projections. */
  timelineLinks: WebRouteLinkSet;
};

/**
 * Result returned by `startManagedWebServer`.
 */
export type WebServerStartResult = WebServerStatusResult & {
  /** Start outcome describing whether a new process was spawned. */
  outcome: WebServerStartOutcome;
};

/**
 * Result returned by `stopManagedWebServer`.
 */
export type WebServerStopResult = {
  /** Stop outcome describing how the runtime was handled. */
  outcome: WebServerStopOutcome;
  /** Resolved singleton key for the stopped runtime. */
  runtimeKey: WebServerRuntimeKey;
  /** Current bind configuration. */
  bind: WebServerBindConfig;
  /** Stable local base URL for same-machine links. */
  localBaseUrl: string;
  /** Optional public base URL for external links. */
  publicBaseUrl?: string;
  /** Reporting-only source of the current public base URL. */
  publicBaseUrlSource: WebServerPublicUrlSource;
  /** Optional best-effort public URL candidate. */
  publicUrlSuggestion?: string;
  /** Root route URLs for current local/public projections. */
  rootLinks: WebRouteLinkSet;
  /** Timeline route URLs for current local/public projections. */
  timelineLinks: WebRouteLinkSet;
  /** Optional stale-state explanation when cleanup handled invalid runtime state. */
  staleReason?: string;
};
