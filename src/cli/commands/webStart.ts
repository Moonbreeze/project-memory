import { createInterface } from "node:readline/promises";

import {
  createRepositoryContext,
  ProjectMemoryWebPublicBaseUrlEnvVar,
  resolveManagedWebServerConfig,
  startManagedWebServer,
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

const canPromptForPublicUrl = (): boolean => {
  return (
    !process.env[ProjectMemoryWebPublicBaseUrlEnvVar]?.trim()
    && process.stdin.isTTY === true
    && process.stdout.isTTY === true
  );
};

const promptForPublicBaseUrl = async (
  suggestion: string | undefined,
): Promise<string | undefined> => {
  const prompt = suggestion
    ? `Public base URL (leave blank to skip, suggestion: ${suggestion}): `
    : "Public base URL (leave blank to skip): ";
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const value = await readline.question(prompt);
    const trimmedValue = value.trim();
    return trimmedValue === "" ? undefined : trimmedValue;
  } finally {
    readline.close();
  }
};

/**
 * Handles the `web-start` CLI command.
 */
export const webStartCommand: CliCommandHandler = async (flags, io) => {
  const context = createRepositoryContext(io.context);
  const host = resolveOptionalHost(flags.host);
  const port = parseOptionalPort(flags.port, "port");
  const shouldPromptForPublicUrl =
    parseOptionalBoolean(flags["prompt-public-url"], "prompt-public-url")
    ?? canPromptForPublicUrl();
  const shouldSuggestPublicUrl =
    parseOptionalBoolean(flags["suggest-public-url"], "suggest-public-url")
    ?? shouldPromptForPublicUrl;
  const explicitPublicBaseUrl = resolveOptionalHost(flags["public-base-url"]);
  const promptSuggestion = resolveManagedWebServerConfig(
    {
      host,
      port,
      suggestPublicUrl: shouldSuggestPublicUrl,
    },
    context,
  ).publicUrl.publicUrlSuggestion;
  const publicBaseUrl = explicitPublicBaseUrl
    ?? (
      shouldPromptForPublicUrl
        ? await promptForPublicBaseUrl(promptSuggestion)
        : undefined
    );

  printJson(
    startManagedWebServer(
      {
        host,
        port,
        publicBaseUrl,
        suggestPublicUrl: shouldSuggestPublicUrl,
      },
      context,
    ),
    io,
  );
};
