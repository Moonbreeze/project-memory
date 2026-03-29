/**
 * Default network host for the local Web UI.
 */
export const DefaultWebHost = "127.0.0.1";

/**
 * Default network port for the local Web UI.
 */
export const DefaultWebPort = 4310;

/**
 * Preferred environment variable for overriding the Web host.
 */
export const ProjectMemoryWebHostEnvVar = "PROJECT_MEMORY_WEB_HOST";

/**
 * Fallback environment variable for overriding the Web host.
 */
export const GenericWebHostEnvVar = "HOST";

/**
 * Preferred environment variable for overriding the Web port.
 */
export const ProjectMemoryWebPortEnvVar = "PROJECT_MEMORY_WEB_PORT";

/**
 * Fallback environment variable for overriding the Web port.
 */
export const GenericWebPortEnvVar = "PORT";

/**
 * Environment variable used as the source of truth for public Web links.
 */
export const ProjectMemoryWebPublicBaseUrlEnvVar = "PROJECT_MEMORY_WEB_PUBLIC_BASE_URL";

/**
 * Prefix used for ephemeral runtime files stored outside the memory repository.
 */
export const WebRuntimeFilePrefix = "project-memory-web-runtime";

/**
 * Time budget used while waiting for a started Web server to accept connections.
 */
export const WebServerStartTimeoutMs = 8_000;

/**
 * Poll interval used while waiting for a started Web server to accept connections.
 */
export const WebServerStartPollIntervalMs = 150;

/**
 * Grace period used before escalating a stop request from `SIGTERM` to `SIGKILL`.
 */
export const WebServerStopTimeoutMs = 3_000;
