import type { RepositoryContext } from "../core/index.ts";

/**
 * Runtime configuration for the local read-only Web server.
 */
export type WebRuntimeConfig = {
  /** Network host to bind. */
  host: string;
  /** Network port to bind. */
  port: number;
  /** Shared repository context reused by the Web layer. */
  context: RepositoryContext;
};

/**
 * Minimal request shape needed by the Web route handler.
 */
export type WebRequestInput = {
  /** Optional HTTP method. */
  method?: string;
  /** Optional request URL or path. */
  url?: string;
};

/**
 * Serialized HTTP response returned by the Web route handler.
 */
export type WebResponsePayload = {
  /** Response body text. */
  body: string;
  /** Response content type. */
  contentType: string;
  /** HTTP status code. */
  statusCode: number;
};
