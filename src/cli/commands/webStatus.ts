import {
  createRepositoryContext,
  getManagedWebServerStatus,
} from "../../core/index.ts";
import {
  parseOptionalBoolean,
  parseOptionalPort,
  printJson,
} from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

const resolveOptionalHost = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

/**
 * Handles the `web-status` CLI command.
 */
export const webStatusCommand: CliCommandHandler = (flags, io) => {
  printJson(
    getManagedWebServerStatus(
      {
        host: resolveOptionalHost(flags.host),
        port: parseOptionalPort(flags.port, "port"),
        publicBaseUrl: resolveOptionalHost(flags["public-base-url"]),
        suggestPublicUrl: parseOptionalBoolean(
          flags["suggest-public-url"],
          "suggest-public-url",
        ),
      },
      createRepositoryContext(io.context),
    ),
    io,
  );
};
