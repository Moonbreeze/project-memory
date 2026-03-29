/**
 * Shared-core lifecycle constants for the managed Web runtime.
 */
export {
  DefaultWebHost,
  DefaultWebPort,
  GenericWebHostEnvVar,
  GenericWebPortEnvVar,
  ProjectMemoryWebHostEnvVar,
  ProjectMemoryWebPortEnvVar,
  ProjectMemoryWebPublicBaseUrlEnvVar,
} from "./constants.ts";

/**
 * Shared-core lifecycle types and type guards for the managed Web runtime.
 */
export type {
  ManagedWebServerConfig,
  WebRouteLinkSet,
  WebServerBindConfig,
  WebServerLifecycleInput,
  WebServerLifecycleState,
  WebServerPublicUrlConfig,
  WebServerPublicUrlSource,
  WebServerRuntimeKey,
  WebServerRuntimeRecord,
  WebServerStartOutcome,
  WebServerStartResult,
  WebServerStatusResult,
  WebServerStopOutcome,
  WebServerStopResult,
} from "./types.ts";
export {
  isWebServerLifecycleState,
  isWebServerPublicUrlSource,
  isWebServerStartOutcome,
  isWebServerStopOutcome,
} from "./types.ts";

/**
 * Shared-core lifecycle helpers for the managed Web runtime.
 */
export {
  createManagedWebRouteLinks,
  createManagedWebRuntimeFilePath,
  getManagedWebServerStatus,
  resolveManagedWebServerConfig,
  startManagedWebServer,
  stopManagedWebServer,
} from "./runtime.ts";
