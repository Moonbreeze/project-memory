import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import {
  createRepositoryContext,
  isManagedDocumentRelativePath,
  listDocuments,
  readDocument,
} from "../core/index.ts";
import type { ListedDocument, ParsedDocument } from "../core/index.ts";

import {
  DefaultWebHost,
  DefaultWebPort,
  GenericWebHostEnvVar,
  GenericWebPortEnvVar,
  ProjectMemoryWebHostEnvVar,
  ProjectMemoryWebPortEnvVar,
} from "./constants.ts";
import type { WebRequestInput, WebResponsePayload, WebRuntimeConfig } from "./types.ts";

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

const parsePort = (rawPort: string): number => {
  const parsedPort = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(
      `${ProjectMemoryWebPortEnvVar}/${GenericWebPortEnvVar} must be an integer between 1 and 65535`,
    );
  }

  return parsedPort;
};

const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const encodeDocumentRoutePath = (relativePath: string): string => {
  return `/documents/${encodeURIComponent(relativePath)}`;
};

const renderHtmlPage = (title: string, content: string): string => {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    "  <style>",
    "    :root { color-scheme: light; font-family: Georgia, 'Times New Roman', serif; }",
    "    body { margin: 0; background: linear-gradient(180deg, #f7f1e3 0%, #fffdf8 100%); color: #1d1b19; }",
    "    main { max-width: 960px; margin: 0 auto; padding: 32px 20px 48px; }",
    "    header { margin-bottom: 24px; }",
    "    h1 { margin: 0 0 8px; font-size: 2.2rem; }",
    "    nav { margin-bottom: 24px; }",
    "    nav a { color: #5d2e0c; text-decoration: none; font-weight: 700; }",
    "    nav a:hover { text-decoration: underline; }",
    "    ul { padding-left: 20px; }",
    "    li { margin-bottom: 16px; }",
    "    .meta { color: #5f564d; font-size: 0.95rem; }",
    "    .panel { background: rgba(255, 255, 255, 0.84); border: 1px solid #d8cfbf; border-radius: 12px; padding: 18px 20px; box-shadow: 0 12px 30px rgba(75, 53, 32, 0.08); }",
    "    pre { overflow-x: auto; background: #201a17; color: #f8f2e9; padding: 16px; border-radius: 10px; }",
    "    code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <header>",
    "      <h1>Project Memory</h1>",
    "      <div class=\"meta\">Read-only Web shell over the shared core repository context.</div>",
    "    </header>",
    "    <nav><a href=\"/timeline\">Timeline</a></nav>",
    content,
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
};

const renderTimeline = (documents: ListedDocument[]): string => {
  const items = documents.length === 0
    ? "<p class=\"panel\">No managed documents found in the configured memory repository.</p>"
    : [
        "<section class=\"panel\">",
        "  <h2>Latest Documents</h2>",
        "  <ul>",
        ...documents.map((document) => {
          const planningState = document.planningState ? `, planning: ${document.planningState}` : "";
          return [
            "    <li>",
            `      <a href="${escapeHtml(encodeDocumentRoutePath(document.relativePath))}">${escapeHtml(document.metadata.topic)}</a>`,
            `      <div class="meta">${escapeHtml(document.type)} · ${escapeHtml(document.metadata.project)} · ${escapeHtml(document.metadata.status)}${escapeHtml(planningState)}</div>`,
            `      <div class="meta">${escapeHtml(document.metadata.date)} · ${escapeHtml(document.relativePath)}</div>`,
            "    </li>",
          ].join("\n");
        }),
        "  </ul>",
        "</section>",
      ].join("\n");

  return renderHtmlPage("Project Memory Timeline", items);
};

const renderDocumentView = (document: ParsedDocument): string => {
  const metadataLines = [
    `${document.type} · ${document.metadata.project}`,
    `${document.metadata.date} · ${document.metadata.status}`,
    document.relativePath,
  ];

  return renderHtmlPage(
    document.metadata.topic,
    [
      "<section class=\"panel\">",
      `  <h2>${escapeHtml(document.metadata.topic)}</h2>`,
      ...metadataLines.map((line) => `  <div class="meta">${escapeHtml(line)}</div>`),
      "</section>",
      "<section class=\"panel\">",
      "  <h2>Markdown Source</h2>",
      `  <pre><code>${escapeHtml(document.body)}</code></pre>`,
      "</section>",
    ].join("\n"),
  );
};

const renderErrorPage = (title: string, message: string): string => {
  return renderHtmlPage(
    title,
    [
      "<section class=\"panel\">",
      `  <h2>${escapeHtml(title)}</h2>`,
      `  <p>${escapeHtml(message)}</p>`,
      "</section>",
    ].join("\n"),
  );
};

const buildHtmlResponse = (statusCode: number, body: string): WebResponsePayload => {
  return {
    body,
    contentType: "text/html; charset=utf-8",
    statusCode,
  };
};

const buildMethodNotAllowedResponse = (): WebResponsePayload => {
  return {
    body: "Method Not Allowed",
    contentType: "text/plain; charset=utf-8",
    statusCode: 405,
  };
};

const writeResponse = (
  response: ServerResponse<IncomingMessage>,
  requestMethod: string,
  payload: WebResponsePayload,
): void => {
  response.writeHead(payload.statusCode, {
    "content-type": payload.contentType,
  });

  if (requestMethod === "HEAD") {
    response.end();
    return;
  }

  response.end(payload.body);
};

const normalizePathnameFromInput = (request: WebRequestInput): string => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  return url.pathname;
};

const decodeDocumentRelativePath = (pathname: string): string | null => {
  const routePrefix = "/documents/";
  if (!pathname.startsWith(routePrefix)) {
    return null;
  }

  const encodedRelativePath = pathname.slice(routePrefix.length);
  if (!encodedRelativePath) {
    return null;
  }

  try {
    return decodeURIComponent(encodedRelativePath);
  } catch {
    return null;
  }
};

/**
 * Executes one Web request against the thin read-only route layer.
 */
export const handleWebRequest = async (
  request: WebRequestInput,
  config: WebRuntimeConfig,
): Promise<WebResponsePayload> => {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    return buildMethodNotAllowedResponse();
  }

  const pathname = normalizePathnameFromInput(request);

  if (pathname === "/" || pathname === "/timeline") {
    const timelineResult = listDocuments({ limit: 50 }, config.context);
    return buildHtmlResponse(200, renderTimeline(timelineResult.documents));
  }

  const relativePath = decodeDocumentRelativePath(pathname);
  if (relativePath) {
    if (!isManagedDocumentRelativePath(relativePath)) {
      return buildHtmlResponse(
        404,
        renderErrorPage("Not Found", "Document path is outside managed routes."),
      );
    }

    try {
      const document = readDocument(config.context, relativePath);
      return buildHtmlResponse(200, renderDocumentView(document));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes("ENOENT") ? 404 : 500;
      return buildHtmlResponse(
        statusCode,
        renderErrorPage(
          statusCode === 404 ? "Not Found" : "Read Failed",
          statusCode === 404 ? "Managed document was not found." : message,
        ),
      );
    }
  }

  return buildHtmlResponse(404, renderErrorPage("Not Found", "No Web route matches this path."));
};

/**
 * Resolves the local Web runtime configuration from environment variables.
 */
export const resolveWebRuntimeConfig = (): WebRuntimeConfig => {
  const host = getPreferredEnvValue(ProjectMemoryWebHostEnvVar, GenericWebHostEnvVar) ?? DefaultWebHost;
  const rawPort = getPreferredEnvValue(ProjectMemoryWebPortEnvVar, GenericWebPortEnvVar);

  return {
    host,
    port: rawPort ? parsePort(rawPort) : DefaultWebPort,
    context: createRepositoryContext(),
  };
};

/**
 * Creates the local HTTP server for the read-only Web UI.
 */
export const createWebServer = (config: WebRuntimeConfig = resolveWebRuntimeConfig()): Server => {
  const requestHandler = async (
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
  ): Promise<void> => {
    const payload = await handleWebRequest(
      {
        method: request.method,
        url: request.url,
      },
      config,
    );
    writeResponse(response, request.method ?? "GET", payload);
  };

  return createServer((request, response) => {
    void requestHandler(request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      writeResponse(
        response,
        request.method ?? "GET",
        buildHtmlResponse(500, renderErrorPage("Server Error", message)),
      );
    });
  });
};

/**
 * Starts the read-only Web server and logs the bound address.
 */
export const startWebServer = async (
  config: WebRuntimeConfig = resolveWebRuntimeConfig(),
): Promise<Server> => {
  const server = createWebServer(config);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  process.stdout.write(
    `Project Memory Web listening on http://${config.host}:${config.port}\n`,
  );

  return server;
};
