import fs from "node:fs";
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
import { baselineMarkdownRendererNote, renderMarkdownToHtml } from "./markdown.ts";
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

const TimelineRoutePath = "/timeline";

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

type RenderAction = {
  href: string;
  label: string;
};

type RenderBreadcrumb = {
  href?: string;
  label: string;
};

type TimelineContext = {
  activeFilters: Array<{ label: string; value: string }>;
  hasFilters: boolean;
  normalizedPath: string;
};

const parseTimelineContext = (timelineReturnPath: string): TimelineContext => {
  const normalizedPath = normalizeTimelineReturnPath(timelineReturnPath);
  const timelineUrl = new URL(normalizedPath, "http://127.0.0.1");
  const activeFilters: TimelineContext["activeFilters"] = [];

  const project = timelineUrl.searchParams.get("project")?.trim();
  if (project) {
    activeFilters.push({ label: "Project", value: project });
  }

  const type = timelineUrl.searchParams.get("type")?.trim();
  if (type) {
    activeFilters.push({ label: "Type", value: type });
  }

  const status = timelineUrl.searchParams.get("status")?.trim();
  if (status) {
    activeFilters.push({ label: "Status", value: status });
  }

  return {
    activeFilters,
    hasFilters: activeFilters.length > 0,
    normalizedPath,
  };
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

const renderBreadcrumbs = (breadcrumbs: ReadonlyArray<RenderBreadcrumb>): string => {
  return [
    '<nav class="breadcrumbs" aria-label="Breadcrumb">',
    ...breadcrumbs.map((entry, index) => {
      const isLast = index === breadcrumbs.length - 1;
      if (isLast || !entry.href) {
        return `  <span class="breadcrumbs-current">${escapeHtml(entry.label)}</span>`;
      }

      return `  <a href="${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a>`;
    }),
    "</nav>",
  ].join("\n");
};

const renderActionLinks = (actions: ReadonlyArray<RenderAction>): string => {
  if (actions.length === 0) {
    return "";
  }

  return [
    '<div class="timeline-actions">',
    ...actions.map((action) => {
      return `  <a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`;
    }),
    "</div>",
  ].join("\n");
};

const renderTagList = (
  entries: ReadonlyArray<{ label: string; value: string }>,
  emptyLabel: string,
): string => {
  if (entries.length === 0) {
    return `<p class="meta">${escapeHtml(emptyLabel)}</p>`;
  }

  return [
    '<ul class="tag-list" aria-label="Active filters">',
    ...entries.map((entry) => {
      return `  <li><span class="tag-label">${escapeHtml(entry.label)}</span>${escapeHtml(entry.value)}</li>`;
    }),
    "</ul>",
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

const normalizeTimelinePath = (pathname: string, search: string): string => {
  if (pathname !== "/" && pathname !== TimelineRoutePath) {
    return TimelineRoutePath;
  }

  return search ? `${TimelineRoutePath}${search}` : TimelineRoutePath;
};

const normalizeTimelineReturnPath = (rawValue: string | null): string => {
  if (!rawValue) {
    return TimelineRoutePath;
  }

  try {
    const url = new URL(rawValue, "http://127.0.0.1");
    return normalizeTimelinePath(url.pathname, url.search);
  } catch {
    return TimelineRoutePath;
  }
};

const createDocumentHref = (routePath: string, timelineReturnPath: string): string => {
  const documentUrl = new URL(routePath, "http://127.0.0.1");
  documentUrl.searchParams.set("from", timelineReturnPath);
  return `${documentUrl.pathname}?${documentUrl.searchParams.toString()}`;
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
    "    .breadcrumbs { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; font-size: 0.92rem; }",
    "    .breadcrumbs a::after { content: '/'; margin-left: 10px; color: #a18b77; }",
    "    .breadcrumbs-current { color: #5f564d; font-weight: 700; }",
    "    ul { padding-left: 20px; }",
    "    li { margin-bottom: 16px; }",
    "    .meta { color: #5f564d; font-size: 0.95rem; }",
    "    .panel { background: rgba(255, 255, 255, 0.84); border: 1px solid #d8cfbf; border-radius: 12px; padding: 18px 20px; box-shadow: 0 12px 30px rgba(75, 53, 32, 0.08); }",
    "    .page-intro { display: grid; gap: 10px; margin-bottom: 18px; }",
    "    .page-stack { display: grid; gap: 18px; }",
    "    .timeline-list { list-style: none; padding-left: 0; margin: 24px 0 0; display: grid; gap: 16px; }",
    "    .timeline-item { display: grid; gap: 14px; }",
    "    .timeline-title { margin-bottom: 0; font-size: 1.35rem; }",
    "    .timeline-title a { color: #5d2e0c; text-decoration: none; }",
    "    .timeline-title a:hover { text-decoration: underline; }",
    "    .timeline-actions { display: flex; gap: 12px; flex-wrap: wrap; }",
    "    .timeline-actions a { color: #5d2e0c; font-weight: 700; text-decoration: none; }",
    "    .timeline-actions a:hover { text-decoration: underline; }",
    "    .tag-list { list-style: none; padding-left: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 10px; }",
    "    .tag-list li { margin: 0; padding: 6px 10px; border-radius: 999px; background: #f1e5d3; color: #4d3424; font-size: 0.92rem; }",
    "    .tag-label { margin-right: 6px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: #7a6a5c; }",
    "    .state-list { margin: 0; padding-left: 20px; }",
    "    .state-list li { margin-bottom: 10px; }",
    "    .metadata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px 18px; margin: 0; }",
    "    .metadata-grid dt { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: #7a6a5c; }",
    "    .metadata-grid dd { margin: 4px 0 0; font-size: 0.98rem; word-break: break-word; }",
    "    pre { overflow-x: auto; background: #201a17; color: #f8f2e9; padding: 16px; border-radius: 10px; }",
    "    code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; }",
    "    .markdown-body > :first-child { margin-top: 0; }",
    "    .markdown-body > :last-child { margin-bottom: 0; }",
    "    .markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body pre { margin: 0 0 16px; }",
    "    .markdown-body ul, .markdown-body ol { padding-left: 24px; }",
    "    .markdown-body li { margin-bottom: 8px; }",
    "    .markdown-body a { color: #7b2f14; }",
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

const renderTimeline = (view: WebTimelineView, timelineReturnPath: string): string => {
  const timelineContext = parseTimelineContext(timelineReturnPath);
  const actions: RenderAction[] = timelineContext.hasFilters
    ? [{ href: TimelineRoutePath, label: "Clear filters" }]
    : [];
  const emptyStateTitle = timelineContext.hasFilters
    ? "No Matching Documents"
    : "No Documents Yet";
  const emptyStateMessage = timelineContext.hasFilters
    ? "No managed documents matched the current timeline query."
    : "No managed documents are available in this repository yet.";
  const invalidDocumentPanel = view.invalidDocuments.length === 0
    ? ""
    : [
        '<section class="panel">',
        "  <h2>Invalid Managed Documents</h2>",
        `  <p class="meta">${escapeHtml(`${view.invalidDocuments.length} invalid document${view.invalidDocuments.length === 1 ? "" : "s"} skipped while building the timeline.`)}</p>`,
        '  <ul class="state-list">',
        ...view.invalidDocuments.map((document) => {
          return `    <li><strong>${escapeHtml(document.relativePath)}</strong><br>${escapeHtml(document.message)}</li>`;
        }),
        "  </ul>",
        "</section>",
      ].join("\n");
  const items = view.rows.length === 0
    ? [
        '<section class="page-intro panel">',
        renderBreadcrumbs([{ label: "Timeline" }]).split("\n").map((line) => `  ${line}`).join("\n"),
        "  <h2>Timeline</h2>",
        '  <p class="meta">Read-only latest-first browsing over managed project-memory documents.</p>',
        `  <p class="meta">${escapeHtml(renderTimelineQuerySummary(view))}</p>`,
        `  ${renderTagList(timelineContext.activeFilters, "No project, type, or status filters are active.")}`,
        "</section>",
        '<section class="panel">',
        `  <h2>${escapeHtml(emptyStateTitle)}</h2>`,
        `  <p>${escapeHtml(emptyStateMessage)}</p>`,
        ...(actions.length > 0
          ? [renderActionLinks(actions).split("\n").map((line) => `  ${line}`).join("\n")]
          : []),
        "</section>",
        invalidDocumentPanel,
      ].filter((section) => section.length > 0).join("\n")
    : [
        '<section class="page-intro panel">',
        renderBreadcrumbs([{ label: "Timeline" }]).split("\n").map((line) => `  ${line}`).join("\n"),
        "  <h2>Latest Documents</h2>",
        '  <p class="meta">Ordered by shared-core latest-first chronology using date, recorded_at, then relativePath.</p>',
        `  <p class="meta">${escapeHtml(renderTimelineQuerySummary(view))}</p>`,
        `  ${renderTagList(timelineContext.activeFilters, "No project, type, or status filters are active.")}`,
        ...(actions.length > 0
          ? [renderActionLinks(actions).split("\n").map((line) => `  ${line}`).join("\n")]
          : []),
        "</section>",
        invalidDocumentPanel,
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
          const documentHref = createDocumentHref(document.routePath, timelineReturnPath);

          return [
            '    <li class="timeline-item panel">',
            `      <h3 class="timeline-title"><a href="${escapeHtml(documentHref)}">${escapeHtml(document.topic)}</a></h3>`,
            renderMetadataEntries(metadataEntries).split("\n").map((line) => `      ${line}`).join("\n"),
            '      <div class="timeline-actions">',
            `        <a href="${escapeHtml(documentHref)}">Open document</a>`,
            "      </div>",
            "    </li>",
          ].join("\n");
        }),
        "  </ul>",
        "</section>",
      ].join("\n");

  return renderHtmlPage("Project Memory Timeline", `<div class="page-stack">${items}</div>`);
};

const renderDocumentView = (
  document: WebDocumentDetail,
  timelineReturnPath: string,
): string => {
  const timelineContext = parseTimelineContext(timelineReturnPath);
  const metadataEntries = [
    { label: "Topic", value: document.topic },
    { label: "Type", value: document.type },
    { label: "Project", value: document.project },
    { label: "Status", value: document.status },
    { label: "Date", value: document.date },
    { label: "Recorded At", value: document.recordedAt ?? "Not recorded" },
    { label: "Path", value: document.relativePath },
  ];

  return renderHtmlPage(
    document.topic,
    [
      '<section class="page-intro panel">',
      renderBreadcrumbs([
        { href: timelineContext.normalizedPath, label: "Timeline" },
        { label: document.topic },
      ]).split("\n").map((line) => `  ${line}`).join("\n"),
      `  <h2>${escapeHtml(document.topic)}</h2>`,
      '  <p class="meta">Exact managed document view resolved through the shared-core read surface.</p>',
      `  ${renderTagList(timelineContext.activeFilters, "Opened from the unfiltered timeline view.")}`,
      renderActionLinks([
        { href: timelineContext.normalizedPath, label: "Back to timeline" },
      ]).split("\n").map((line) => `  ${line}`).join("\n"),
      "</section>",
      "<section class=\"panel\">",
      "  <h2>Document Metadata</h2>",
      renderMetadataEntries(metadataEntries).split("\n").map((line) => `  ${line}`).join("\n"),
      "</section>",
      "<section class=\"panel\">",
      "  <h2>Rendered Markdown</h2>",
      `  <p class="meta">${escapeHtml(baselineMarkdownRendererNote)}</p>`,
      `  <div class="markdown-body">${renderMarkdownToHtml(document.body)}</div>`,
      "</section>",
    ].join("\n"),
  );
};

const renderErrorPage = (
  title: string,
  message: string,
  options: {
    actions?: ReadonlyArray<RenderAction>;
    breadcrumbs?: ReadonlyArray<RenderBreadcrumb>;
    metadataEntries?: ReadonlyArray<{ label: string; value: string }>;
  } = {},
): string => {
  return renderHtmlPage(
    title,
    [
      "<section class=\"panel page-intro\">",
      ...(options.breadcrumbs
        ? [renderBreadcrumbs(options.breadcrumbs).split("\n").map((line) => `  ${line}`).join("\n")]
        : []),
      `  <h2>${escapeHtml(title)}</h2>`,
      `  <p>${escapeHtml(message)}</p>`,
      ...(options.metadataEntries && options.metadataEntries.length > 0
        ? [renderMetadataEntries(options.metadataEntries).split("\n").map((line) => `  ${line}`).join("\n")]
        : []),
      ...(options.actions && options.actions.length > 0
        ? [renderActionLinks(options.actions).split("\n").map((line) => `  ${line}`).join("\n")]
        : []),
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

type DecodedDocumentRoute =
  | {
      kind: "invalid";
      message: string;
    }
  | {
      kind: "matched";
      relativePath: string;
    }
  | {
      kind: "unmatched";
    };

const decodeDocumentRoute = (pathname: string): DecodedDocumentRoute => {
  const routePrefix = "/documents/";
  if (pathname === "/documents" || pathname === routePrefix) {
    return {
      kind: "invalid",
      message: "Document route requires an encoded managed relative path.",
    };
  }

  if (!pathname.startsWith(routePrefix)) {
    return { kind: "unmatched" };
  }

  const encodedRelativePath = pathname.slice(routePrefix.length);
  if (!encodedRelativePath) {
    return {
      kind: "invalid",
      message: "Document route requires an encoded managed relative path.",
    };
  }

  try {
    const relativePath = decodeURIComponent(encodedRelativePath);
    if (!relativePath) {
      return {
        kind: "invalid",
        message: "Document route requires an encoded managed relative path.",
      };
    }

    return { kind: "matched", relativePath };
  } catch {
    return {
      kind: "invalid",
      message: "Document route contains an invalid encoded relative path.",
    };
  }
};

const validateDirectory = (absolutePath: string, label: string): string | undefined => {
  if (!fs.existsSync(absolutePath)) {
    return `${label} is missing: ${absolutePath}`;
  }

  try {
    if (!fs.statSync(absolutePath).isDirectory()) {
      return `${label} is not a directory: ${absolutePath}`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${label} could not be validated: ${message}`;
  }

  return undefined;
};

const getWebConfigurationError = (config: WebRuntimeConfig): string | undefined => {
  const configurationError = config.configurationError?.trim();
  if (configurationError) {
    return configurationError;
  }

  if (!config.context) {
    return "PROJECT_MEMORY_ROOT must resolve to a readable external memory repository before using the Web UI.";
  }

  const memoryRootError = validateDirectory(
    config.context.memoryRootDir,
    "PROJECT_MEMORY_ROOT",
  );
  if (memoryRootError) {
    return memoryRootError;
  }

  return validateDirectory(config.context.projectsDir, "PROJECT_MEMORY_ROOT/projects");
};

const buildConfigurationErrorResponse = (
  message: string,
  config: WebRuntimeConfig,
): WebResponsePayload => {
  const metadataEntries = config.context
    ? [{ label: "Memory Root", value: config.context.memoryRootDir }]
    : [];

  return buildHtmlResponse(
    500,
    renderErrorPage("Configuration Error", message, {
      breadcrumbs: [{ label: "Configuration Error" }],
      metadataEntries,
    }),
  );
};

const buildReadErrorResponse = (
  error: WebReadError,
  timelineReturnPath: string = TimelineRoutePath,
): WebResponsePayload => {
  const timelineContext = parseTimelineContext(timelineReturnPath);
  const title = error.code === "configuration-error"
    ? "Configuration Error"
    : error.code === "invalid-document"
      ? "Invalid Document"
      : error.code === "invalid-query"
        ? "Invalid Query"
        : "Not Found";

  return buildHtmlResponse(
    error.statusCode,
    renderErrorPage(title, error.message, {
      actions: error.code === "configuration-error"
        ? []
        : [{ href: timelineContext.normalizedPath, label: "Back to timeline" }],
      breadcrumbs: [
        { href: timelineContext.normalizedPath, label: "Timeline" },
        { label: title },
      ],
      metadataEntries: timelineContext.activeFilters,
    }),
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
  const timelineReturnPath = normalizeTimelineReturnPath(requestUrl.searchParams.get("from"));
  const configurationError = getWebConfigurationError(config);
  if (configurationError) {
    return buildConfigurationErrorResponse(configurationError, config);
  }

  const context = config.context;
  if (!context) {
    return buildConfigurationErrorResponse(
      "PROJECT_MEMORY_ROOT must resolve to a readable external memory repository before using the Web UI.",
      config,
    );
  }

  if (pathname === "/" || pathname === TimelineRoutePath) {
    try {
      const timelineQuery = normalizeWebTimelineQuery({
        limit: requestUrl.searchParams.get("limit") ?? undefined,
        project: requestUrl.searchParams.get("project") ?? undefined,
        status: requestUrl.searchParams.get("status") ?? undefined,
        type: requestUrl.searchParams.get("type") ?? undefined,
      });
      const timelineResult = readWebTimeline(timelineQuery, context);
      return buildHtmlResponse(
        200,
        renderTimeline(timelineResult, normalizeTimelinePath(pathname, requestUrl.search)),
      );
    } catch (error) {
      if (isWebReadError(error)) {
        return buildReadErrorResponse(error);
      }

      throw error;
    }
  }

  const documentRoute = decodeDocumentRoute(pathname);
  if (documentRoute.kind === "invalid") {
    return buildHtmlResponse(
      400,
      renderErrorPage("Invalid Document", documentRoute.message, {
        actions: [{ href: timelineReturnPath, label: "Back to timeline" }],
        breadcrumbs: [
          { href: timelineReturnPath, label: "Timeline" },
          { label: "Invalid Document" },
        ],
        metadataEntries: parseTimelineContext(timelineReturnPath).activeFilters,
      }),
    );
  }

  if (documentRoute.kind === "matched") {
    try {
      const document = readWebDocument(documentRoute.relativePath, context);
      return buildHtmlResponse(200, renderDocumentView(document, timelineReturnPath));
    } catch (error) {
      if (isWebReadError(error)) {
        return buildReadErrorResponse(error, timelineReturnPath);
      }

      throw error;
    }
  }

  return buildHtmlResponse(
    404,
    renderErrorPage("Not Found", "No Web route matches this path.", {
      actions: [{ href: TimelineRoutePath, label: "Back to timeline" }],
      breadcrumbs: [
        { href: TimelineRoutePath, label: "Timeline" },
        { label: "Not Found" },
      ],
    }),
  );
};

/**
 * Resolves the local Web runtime configuration from environment variables.
 */
export const resolveWebRuntimeConfig = (): WebRuntimeConfig => {
  const host = getPreferredEnvValue(ProjectMemoryWebHostEnvVar, GenericWebHostEnvVar) ?? DefaultWebHost;
  const rawPort = getPreferredEnvValue(ProjectMemoryWebPortEnvVar, GenericWebPortEnvVar);
  const port = rawPort ? parsePort(rawPort) : DefaultWebPort;

  try {
    return {
      context: createRepositoryContext(),
      host,
      port,
    };
  } catch (error) {
    return {
      configurationError: error instanceof Error ? error.message : String(error),
      host,
      port,
    };
  }
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
