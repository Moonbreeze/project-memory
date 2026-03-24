import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import { createRepositoryContext } from "../core/index.ts";

import {
  DefaultWebHost,
  DefaultWebPort,
  GenericWebHostEnvVar,
  GenericWebPortEnvVar,
  ProjectMemoryWebHostEnvVar,
  ProjectMemoryWebPortEnvVar,
} from "./constants.ts";
import {
  isWebReadError,
  normalizeWebTimelineQuery,
  readWebDocument,
  readWebTimeline,
} from "./readAdapter.ts";
import type {
  WebDocumentDetail,
  WebReadError,
  WebRequestInput,
  WebResponsePayload,
  WebRuntimeConfig,
  WebTimelineView,
} from "./types.ts";

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

const renderMetadataEntries = (
  entries: ReadonlyArray<{ label: string; value: string }>,
): string => {
  return [
    '<dl class="metadata-grid">',
    ...entries.map((entry) => {
      return [
        "  <div>",
        `    <dt>${escapeHtml(entry.label)}</dt>`,
        `    <dd>${escapeHtml(entry.value)}</dd>`,
        "  </div>",
      ].join("\n");
    }),
    "</dl>",
  ].join("\n");
};

const renderTimelineQuerySummary = (view: WebTimelineView): string => {
  const summaryParts = [`${view.rows.length} result${view.rows.length === 1 ? "" : "s"}`];

  if (view.appliedQuery.project) {
    summaryParts.push(`project: ${view.appliedQuery.project}`);
  }

  if (view.appliedQuery.type) {
    summaryParts.push(`type: ${view.appliedQuery.type}`);
  }

  if (view.appliedQuery.status) {
    summaryParts.push(`status: ${view.appliedQuery.status}`);
  }

  summaryParts.push(`limit: ${String(view.appliedQuery.limit)}`);

  return summaryParts.join(" · ");
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
    "    * { box-sizing: border-box; }",
    "    body { margin: 0; background: radial-gradient(circle at top, rgba(211, 170, 109, 0.22), transparent 28%), linear-gradient(180deg, #f7f1e3 0%, #fffdf8 100%); color: #1d1b19; }",
    "    main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 48px; }",
    "    header { margin-bottom: 24px; }",
    "    h1 { margin: 0 0 8px; font-size: 2.2rem; }",
    "    h2, h3 { margin-top: 0; }",
    "    nav { margin-bottom: 24px; }",
    "    nav a { color: #5d2e0c; text-decoration: none; font-weight: 700; }",
    "    nav a:hover { text-decoration: underline; }",
    "    ul { padding-left: 20px; }",
    "    li { margin-bottom: 16px; }",
    "    .meta { color: #5f564d; font-size: 0.95rem; }",
    "    .panel { background: rgba(255, 255, 255, 0.84); border: 1px solid #d8cfbf; border-radius: 12px; padding: 18px 20px; box-shadow: 0 12px 30px rgba(75, 53, 32, 0.08); }",
    "    .page-intro { display: grid; gap: 10px; margin-bottom: 18px; }",
    "    .timeline-list { list-style: none; padding-left: 0; margin: 24px 0 0; display: grid; gap: 16px; }",
    "    .timeline-item { display: grid; gap: 14px; }",
    "    .timeline-title { margin-bottom: 0; font-size: 1.35rem; }",
    "    .timeline-title a { color: #5d2e0c; text-decoration: none; }",
    "    .timeline-title a:hover { text-decoration: underline; }",
    "    .timeline-actions { display: flex; gap: 12px; flex-wrap: wrap; }",
    "    .timeline-actions a { color: #5d2e0c; font-weight: 700; text-decoration: none; }",
    "    .timeline-actions a:hover { text-decoration: underline; }",
    "    .metadata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px 18px; margin: 0; }",
    "    .metadata-grid dt { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: #7a6a5c; }",
    "    .metadata-grid dd { margin: 4px 0 0; font-size: 0.98rem; word-break: break-word; }",
    "    pre { overflow-x: auto; background: #201a17; color: #f8f2e9; padding: 16px; border-radius: 10px; }",
    "    code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; }",
    "    @media (max-width: 640px) {",
    "      main { padding: 24px 14px 36px; }",
    "      h1 { font-size: 1.9rem; }",
    "      .panel { padding: 16px; }",
    "    }",
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

const renderTimeline = (view: WebTimelineView): string => {
  const items = view.rows.length === 0
    ? "<p class=\"panel\">No managed documents matched the current timeline query.</p>"
    : [
        '<section class="page-intro panel">',
        "  <h2>Latest Documents</h2>",
        '  <p class="meta">Ordered by shared-core latest-first chronology using date, recorded_at, then relativePath.</p>',
        `  <p class="meta">${escapeHtml(renderTimelineQuerySummary(view))}</p>`,
        "</section>",
        '<section aria-label="Timeline results">',
        '  <ul class="timeline-list">',
        ...view.rows.map((document) => {
          const metadataEntries = [
            { label: "Type", value: document.type },
            { label: "Project", value: document.project },
            { label: "Status", value: document.status },
            { label: "Date", value: document.date },
            ...(document.recordedAt ? [{ label: "Recorded At", value: document.recordedAt }] : []),
            ...(document.planningState ? [{ label: "Planning", value: document.planningState }] : []),
            ...(document.dependencyCount !== undefined
              ? [{ label: "Dependencies", value: String(document.dependencyCount) }]
              : []),
            ...(document.unresolvedDependencyCount !== undefined
              ? [{ label: "Unresolved", value: String(document.unresolvedDependencyCount) }]
              : []),
            { label: "Path", value: document.relativePath },
          ];

          return [
            '    <li class="timeline-item panel">',
            `      <h3 class="timeline-title"><a href="${escapeHtml(document.routePath)}">${escapeHtml(document.topic)}</a></h3>`,
            renderMetadataEntries(metadataEntries).split("\n").map((line) => `      ${line}`).join("\n"),
            '      <div class="timeline-actions">',
            `        <a href="${escapeHtml(document.routePath)}">Open document</a>`,
            "      </div>",
            "    </li>",
          ].join("\n");
        }),
        "  </ul>",
        "</section>",
      ].join("\n");

  return renderHtmlPage("Project Memory Timeline", items);
};

const renderDocumentView = (document: WebDocumentDetail): string => {
  const metadataLines = [
    `${document.type} · ${document.project}`,
    `${document.date} · ${document.status}`,
    document.relativePath,
  ];

  return renderHtmlPage(
    document.topic,
    [
      "<section class=\"panel\">",
      `  <h2>${escapeHtml(document.topic)}</h2>`,
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

const normalizeUrlFromInput = (request: WebRequestInput): URL => {
  return new URL(request.url ?? "/", "http://127.0.0.1");
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

const buildReadErrorResponse = (error: WebReadError): WebResponsePayload => {
  return buildHtmlResponse(
    error.statusCode,
    renderErrorPage(
      error.statusCode === 404
        ? "Not Found"
        : error.code === "invalid-query"
          ? "Invalid Query"
          : "Read Failed",
      error.message,
    ),
  );
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

  const requestUrl = normalizeUrlFromInput(request);
  const pathname = requestUrl.pathname;

  if (pathname === "/" || pathname === "/timeline") {
    try {
      const timelineQuery = normalizeWebTimelineQuery({
        limit: requestUrl.searchParams.get("limit") ?? undefined,
        project: requestUrl.searchParams.get("project") ?? undefined,
        status: requestUrl.searchParams.get("status") ?? undefined,
        type: requestUrl.searchParams.get("type") ?? undefined,
      });
      const timelineResult = readWebTimeline(timelineQuery, config.context);
      return buildHtmlResponse(200, renderTimeline(timelineResult));
    } catch (error) {
      if (isWebReadError(error)) {
        return buildReadErrorResponse(error);
      }

      throw error;
    }
  }

  const relativePath = decodeDocumentRelativePath(pathname);
  if (relativePath) {
    try {
      const document = readWebDocument(relativePath, config.context);
      return buildHtmlResponse(200, renderDocumentView(document));
    } catch (error) {
      if (isWebReadError(error)) {
        return buildReadErrorResponse(error);
      }

      throw error;
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
