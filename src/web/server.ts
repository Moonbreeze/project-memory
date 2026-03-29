import fs from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import {
  createRepositoryContext,
  resolveManagedWebServerConfig,
  DocumentStatusValues,
  DocumentTypeValues,
} from "../core/index.ts";
import { fallbackRecordedAtForDate } from "../core/documents/index.ts";

import {
  AllProjectsFilterLabel,
  AllProjectsFilterValue,
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
  normalizeWebSearchQuery,
  normalizeWebTimelineQuery,
  readWebDocument,
  readWebSearch,
  readWebTimeline,
} from "./readAdapter.ts";
import type {
  WebDocumentDetail,
  WebReadError,
  WebRequestInput,
  WebResponsePayload,
  WebRuntimeConfig,
  WebSearchView,
  WebTimelineView,
} from "./types.ts";

const TimelineRoutePath = "/timeline";
const SearchRoutePath = "/search";

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
  limit?: string;
  project?: string;
  projectSelection?: string;
  status?: string;
  type?: string;
};

type SearchContext = {
  activeFilters: Array<{ label: string; value: string }>;
  backPath: string;
  hasExecutedQuery: boolean;
  normalizedPath: string;
  limit?: string;
  project?: string;
  projectSelection?: string;
  queryText?: string;
  type?: string;
};

type ReturnContext = {
  activeFilters: Array<{ label: string; value: string }>;
  backLabel: string;
  kind: "search" | "timeline";
  normalizedPath: string;
  rootLabel: string;
};

const parseTimelineContext = (timelineReturnPath: string): TimelineContext => {
  const timelineReturnUrl = normalizeTimelineReturnPath(timelineReturnPath);
  const timelineUrl = new URL(timelineReturnUrl, "http://127.0.0.1");
  const activeFilters: TimelineContext["activeFilters"] = [];

  const projectSelection = timelineUrl.searchParams.get("project")?.trim();
  const project = projectSelection === AllProjectsFilterValue ? undefined : projectSelection;
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

  const limit = timelineUrl.searchParams.get("limit")?.trim();
  const normalizedPath = createTimelineQueryPath({
    limit,
    projectSelection,
    status,
    type,
  });

  return {
    activeFilters,
    hasFilters: activeFilters.length > 0,
    limit,
    normalizedPath,
    project,
    projectSelection,
    status,
    type,
  };
};

function createTimelineQueryPath(
  query: {
    limit?: string;
    projectSelection?: string;
    status?: string;
    type?: string;
  },
): string {
  const timelineUrl = new URL(TimelineRoutePath, "http://127.0.0.1");

  if (query.projectSelection) {
    timelineUrl.searchParams.set("project", query.projectSelection);
  }

  if (query.type) {
    timelineUrl.searchParams.set("type", query.type);
  }

  if (query.status) {
    timelineUrl.searchParams.set("status", query.status);
  }

  if (query.limit) {
    timelineUrl.searchParams.set("limit", query.limit);
  }

  return timelineUrl.search ? `${TimelineRoutePath}?${timelineUrl.searchParams.toString()}` : TimelineRoutePath;
}

function createSearchQueryPath(
  query: {
    from?: string;
    limit?: string;
    projectSelection?: string;
    q?: string;
    type?: string;
  },
): string {
  const searchUrl = new URL(SearchRoutePath, "http://127.0.0.1");

  if (query.q) {
    searchUrl.searchParams.set("q", query.q);
  }

  if (query.projectSelection) {
    searchUrl.searchParams.set("project", query.projectSelection);
  }

  if (query.type) {
    searchUrl.searchParams.set("type", query.type);
  }

  if (query.limit) {
    searchUrl.searchParams.set("limit", query.limit);
  }

  if (query.from) {
    searchUrl.searchParams.set("from", query.from);
  }

  return searchUrl.search ? `${SearchRoutePath}?${searchUrl.searchParams.toString()}` : SearchRoutePath;
}

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

const renderSelectOptions = (
  options: ReadonlyArray<{ label: string; value: string }>,
  selectedValue: string | undefined,
): string => {
  return [
    ...options.map((option) => {
      const isSelected = option.value === selectedValue ? ' selected="selected"' : "";
      return `      <option value="${escapeHtml(option.value)}"${isSelected}>${escapeHtml(option.label)}</option>`;
    }),
  ].join("\n");
};

const renderCollapsibleControl = (
  options: {
    body: string;
    buttonLabel: string;
    controlId: string;
    defaultExpanded: boolean;
    displayMode: "always" | "mobile-only";
    summary: string;
  },
): string => {
  const checkedAttribute = options.defaultExpanded ? ' checked="checked"' : "";

  return [
    `<div class="collapsible-control" data-display-mode="${escapeHtml(options.displayMode)}">`,
    `  <input class="collapsible-toggle-input" type="checkbox" id="${escapeHtml(options.controlId)}"${checkedAttribute}>`,
    '  <div class="collapsible-toggle-row">',
    `    <p class="collapsible-toggle-summary">${escapeHtml(options.summary)}</p>`,
    `    <label class="collapsible-toggle-button" for="${escapeHtml(options.controlId)}">${escapeHtml(options.buttonLabel)}</label>`,
    "  </div>",
    '  <div class="collapsible-panel-body">',
    options.body.split("\n").map((line) => `    ${line}`).join("\n"),
    "  </div>",
    "</div>",
  ].join("\n");
};

const renderTimelineFilterForm = (
  timelineContext: TimelineContext,
  availableProjects: ReadonlyArray<string>,
  resetPath: string,
): string => {
  const projectOptions = [
    { label: AllProjectsFilterLabel, value: AllProjectsFilterValue },
    ...availableProjects.map((project) => {
      return { label: project, value: project };
    }),
  ];
  const typeOptions = [
    { label: "All document types", value: "" },
    ...DocumentTypeValues.map((type) => {
      return { label: type, value: type };
    }),
  ];
  const statusOptions = [
    { label: "All statuses", value: "" },
    ...DocumentStatusValues.map((status) => {
      return { label: status, value: status };
    }),
  ];
  const showReset = timelineContext.normalizedPath !== resetPath;

  return [
    '<form class="filter-form" method="GET" action="/timeline" onchange="this.requestSubmit()">',
    ...(timelineContext.limit
      ? [
          `    <input type="hidden" name="limit" value="${escapeHtml(timelineContext.limit)}">`,
        ]
      : []),
    '  <div class="filter-grid">',
    '      <div class="filter-field project-field">',
    '        <label for="timeline-project-filter">Project</label>',
    '        <select id="timeline-project-filter" name="project">',
    renderSelectOptions(projectOptions, timelineContext.projectSelection),
    "        </select>",
    "      </div>",
    '      <div class="filter-field type-field">',
    '        <label for="timeline-type-filter">Type</label>',
    '        <select id="timeline-type-filter" name="type">',
    renderSelectOptions(typeOptions, timelineContext.type),
    "        </select>",
    "      </div>",
    '      <div class="filter-field status-field">',
    '        <label for="timeline-status-filter">Status</label>',
    '        <select id="timeline-status-filter" name="status">',
    renderSelectOptions(statusOptions, timelineContext.status),
    "        </select>",
    "      </div>",
    '    <div class="filter-actions">',
    ...(showReset
      ? [
          `      <a class="icon-button" href="${escapeHtml(resetPath)}" aria-label="Clear filters" title="Clear filters">&#128465;</a>`,
        ]
      : []),
    "    </div>",
    "  </div>",
    "</form>",
  ].join("\n");
};

const renderSearchForm = (
  searchContext: SearchContext,
  availableProjects: ReadonlyArray<string>,
  resetPath: string,
): string => {
  const projectOptions = [
    { label: AllProjectsFilterLabel, value: AllProjectsFilterValue },
    ...availableProjects.map((project) => {
      return { label: project, value: project };
    }),
  ];
  const typeOptions = [
    { label: "All document types", value: "" },
    ...DocumentTypeValues.map((type) => {
      return { label: type, value: type };
    }),
  ];
  const showReset = searchContext.normalizedPath !== resetPath;

  return [
    '<form class="search-form" method="GET" action="/search">',
    ...(searchContext.backPath !== TimelineRoutePath
      ? [`  <input type="hidden" name="from" value="${escapeHtml(searchContext.backPath)}">`]
      : []),
    '  <div class="search-grid">',
    '    <div class="search-field query-field">',
    '      <label for="search-query">Search</label>',
    `      <input id="search-query" name="q" type="search" value="${escapeHtml(searchContext.queryText ?? "")}" placeholder="Search active managed documents">`,
    "    </div>",
    '    <div class="search-field project-field">',
    '      <label for="search-project-filter">Project</label>',
    '      <select id="search-project-filter" name="project">',
    renderSelectOptions(projectOptions, searchContext.projectSelection),
    "      </select>",
    "    </div>",
    '    <div class="search-field type-field">',
    '      <label for="search-type-filter">Type</label>',
    '      <select id="search-type-filter" name="type">',
    renderSelectOptions(typeOptions, searchContext.type),
    "      </select>",
    "    </div>",
    '    <div class="search-field limit-field">',
    '      <label for="search-limit">Limit</label>',
    `      <input id="search-limit" name="limit" type="number" min="1" max="200" value="${escapeHtml(searchContext.limit ?? "50")}">`,
    "    </div>",
    '    <div class="search-actions">',
    '      <button class="primary-button" type="submit">Search</button>',
    ...(showReset
      ? [`      <a class="icon-button" href="${escapeHtml(resetPath)}" aria-label="Clear search" title="Clear search">&#128465;</a>`]
      : []),
    "    </div>",
    "  </div>",
    "</form>",
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

const renderSearchQuerySummary = (
  view: WebSearchView,
  hasExecutedQuery: boolean,
): string => {
  if (!hasExecutedQuery) {
    return "Use the shared-core search surface with optional project and type narrowing.";
  }

  const summaryParts = [`${view.results.length} result${view.results.length === 1 ? "" : "s"}`];

  if (view.appliedQuery.text) {
    summaryParts.push(`query: ${view.appliedQuery.text}`);
  }

  if (view.appliedQuery.project) {
    summaryParts.push(`project: ${view.appliedQuery.project}`);
  }

  if (view.appliedQuery.type) {
    summaryParts.push(`type: ${view.appliedQuery.type}`);
  }

  summaryParts.push(`limit: ${String(view.appliedQuery.limit)}`);

  return summaryParts.join(" · ");
};

const renderTimelineFilterSummary = (timelineContext: TimelineContext): string => {
  if (timelineContext.activeFilters.length === 0) {
    return "All projects · all document types · all statuses";
  }

  return timelineContext.activeFilters.map((entry) => {
    return `${entry.label.toLowerCase()}: ${entry.value}`;
  }).join(" · ");
};

const parseSearchContext = (searchReturnPath: string): SearchContext => {
  const normalizedSearchPath = normalizeSearchReturnPath(searchReturnPath);
  const searchUrl = new URL(normalizedSearchPath, "http://127.0.0.1");
  const activeFilters: SearchContext["activeFilters"] = [];
  const queryText = searchUrl.searchParams.get("q")?.trim();
  const projectSelection = searchUrl.searchParams.get("project")?.trim();
  const project = projectSelection === AllProjectsFilterValue ? undefined : projectSelection;
  const type = searchUrl.searchParams.get("type")?.trim();
  const limit = searchUrl.searchParams.get("limit")?.trim();
  const hasExplicitBackPath = searchUrl.searchParams.has("from");
  const backPath = normalizeTimelineReturnPath(searchUrl.searchParams.get("from"));
  const hasExecutedQuery = ["q", "project", "type", "limit"].some((parameter) => {
    return searchUrl.searchParams.has(parameter);
  });

  if (queryText) {
    activeFilters.push({ label: "Query", value: queryText });
  }

  if (project) {
    activeFilters.push({ label: "Project", value: project });
  }

  if (type) {
    activeFilters.push({ label: "Type", value: type });
  }

  if (limit) {
    activeFilters.push({ label: "Limit", value: limit });
  }

  return {
    activeFilters,
    backPath,
    hasExecutedQuery,
    limit,
    normalizedPath: createSearchQueryPath({
      from: hasExplicitBackPath ? backPath : undefined,
      limit,
      projectSelection,
      q: queryText,
      type,
    }),
    project,
    projectSelection,
    queryText,
    type,
  };
};

const renderSearchFilterSummary = (searchContext: SearchContext): string => {
  if (searchContext.activeFilters.length === 0) {
    return "Search the current corpus";
  }

  return searchContext.activeFilters.map((entry) => {
    return `${entry.label.toLowerCase()}: ${entry.value}`;
  }).join(" · ");
};

const normalizeTimelinePath = (pathname: string, search: string): string => {
  if (pathname !== "/" && pathname !== TimelineRoutePath) {
    return TimelineRoutePath;
  }

  const timelineUrl = new URL(`${TimelineRoutePath}${search}`, "http://127.0.0.1");
  return createTimelineQueryPath({
    limit: timelineUrl.searchParams.get("limit")?.trim() ?? undefined,
    projectSelection: timelineUrl.searchParams.get("project")?.trim() ?? undefined,
    status: timelineUrl.searchParams.get("status")?.trim() ?? undefined,
    type: timelineUrl.searchParams.get("type")?.trim() ?? undefined,
  });
};

const normalizeSearchPath = (pathname: string, search: string): string => {
  if (pathname !== SearchRoutePath) {
    return SearchRoutePath;
  }

  const searchUrl = new URL(`${SearchRoutePath}${search}`, "http://127.0.0.1");
  const hasExplicitBackPath = searchUrl.searchParams.has("from");

  return createSearchQueryPath({
    from: hasExplicitBackPath
      ? normalizeTimelineReturnPath(searchUrl.searchParams.get("from"))
      : undefined,
    limit: searchUrl.searchParams.get("limit")?.trim() ?? undefined,
    projectSelection: searchUrl.searchParams.get("project")?.trim() ?? undefined,
    q: searchUrl.searchParams.get("q")?.trim() ?? undefined,
    type: searchUrl.searchParams.get("type")?.trim() ?? undefined,
  });
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

const normalizeSearchReturnPath = (rawValue: string | null): string => {
  if (!rawValue) {
    return SearchRoutePath;
  }

  try {
    const url = new URL(rawValue, "http://127.0.0.1");
    return normalizeSearchPath(url.pathname, url.search);
  } catch {
    return SearchRoutePath;
  }
};

const normalizeReturnPath = (rawValue: string | null): string => {
  if (!rawValue) {
    return TimelineRoutePath;
  }

  try {
    const url = new URL(rawValue, "http://127.0.0.1");
    if (url.pathname === SearchRoutePath) {
      return normalizeSearchPath(url.pathname, url.search);
    }

    return normalizeTimelinePath(url.pathname, url.search);
  } catch {
    return TimelineRoutePath;
  }
};

const parseReturnContext = (returnPath: string): ReturnContext => {
  const normalizedPath = normalizeReturnPath(returnPath);

  if (normalizedPath.startsWith(SearchRoutePath)) {
    const searchContext = parseSearchContext(normalizedPath);

    return {
      activeFilters: searchContext.activeFilters,
      backLabel: "Back to search",
      kind: "search",
      normalizedPath: searchContext.normalizedPath,
      rootLabel: "Search",
    };
  }

  const timelineContext = parseTimelineContext(normalizedPath);
  return {
    activeFilters: timelineContext.activeFilters,
    backLabel: "Back to timeline",
    kind: "timeline",
    normalizedPath: timelineContext.normalizedPath,
    rootLabel: "Timeline",
  };
};

const renderTimelineInlineMetadata = (
  entries: ReadonlyArray<{ label: string; value: string }>,
): string => {
  return [
    '<div class="timeline-meta" aria-label="Document metadata">',
    ...entries.map((entry) => {
      return `  <span><span class="timeline-meta-label">${escapeHtml(entry.label)}</span>${escapeHtml(entry.value)}</span>`;
    }),
    "</div>",
  ].join("\n");
};

const hasPreciseRecordedAt = (
  date: string,
  recordedAt: string | undefined,
): boolean => {
  if (!recordedAt) {
    return false;
  }

  return recordedAt !== fallbackRecordedAtForDate(date);
};

const formatRecordedAtForDisplay = (recordedAt: string): string => {
  const timestampMatch = recordedAt.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d{3})?)?Z$/,
  );
  if (!timestampMatch) {
    return recordedAt;
  }

  return `${timestampMatch[1]} ${timestampMatch[2]} UTC`;
};

const renderTimelinePreview = (
  preview: WebDocumentDetail["preview"],
): string => {
  const secondaryLine = preview.secondary
    ? `  <p class="timeline-preview-secondary">${escapeHtml(preview.secondary)}</p>`
    : "";

  return [
    '<div class="timeline-preview" aria-label="Semantic preview">',
    `  <p class="timeline-preview-primary">${escapeHtml(preview.primary)}</p>`,
    secondaryLine,
    "</div>",
  ].filter((line) => line.length > 0).join("\n");
};

const createDocumentHref = (routePath: string, timelineReturnPath: string): string => {
  const documentUrl = new URL(routePath, "http://127.0.0.1");
  documentUrl.searchParams.set("from", timelineReturnPath);
  return `${documentUrl.pathname}?${documentUrl.searchParams.toString()}`;
};

const renderHtmlPage = (
  title: string,
  content: string,
  options: { showSiteHeader?: boolean } = {},
): string => {
  const showSiteHeader = options.showSiteHeader ?? true;

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
    "    main { max-width: 1320px; margin: 0 auto; padding: 24px 20px 48px; }",
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
    "    .timeline-list { list-style: none; padding-left: 0; margin: 0; }",
    "    .timeline-item { display: grid; gap: 8px; padding: 14px 0; border-bottom: 1px solid rgba(93, 46, 12, 0.14); }",
    "    .timeline-item:last-child { border-bottom: none; }",
    "    .timeline-title { margin: 0; font-size: 1.18rem; line-height: 1.2; }",
    "    .timeline-title a { color: #5d2e0c; text-decoration: none; }",
    "    .timeline-title a:hover { text-decoration: underline; }",
    "    .timeline-preview { display: grid; gap: 4px; }",
    "    .timeline-preview-primary, .timeline-preview-secondary { margin: 0; }",
    "    .timeline-preview-primary { font-size: 1rem; line-height: 1.45; color: #2b241f; }",
    "    .timeline-preview-secondary { font-size: 0.94rem; line-height: 1.45; color: #6d6158; }",
    "    .timeline-actions { display: flex; gap: 12px; flex-wrap: wrap; }",
    "    .timeline-actions a { color: #5d2e0c; font-weight: 700; text-decoration: none; }",
    "    .timeline-actions a:hover { text-decoration: underline; }",
    "    .tag-list { list-style: none; padding-left: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 10px; }",
    "    .tag-list li { margin: 0; padding: 6px 10px; border-radius: 999px; background: #f1e5d3; color: #4d3424; font-size: 0.92rem; }",
    "    .tag-label { margin-right: 6px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: #7a6a5c; }",
    "    .view-shell { position: sticky; top: 0; z-index: 10; margin-bottom: 18px; padding: 14px 18px; border: 1px solid rgba(93, 46, 12, 0.16); border-radius: 14px; background: rgba(255, 251, 244, 0.92); backdrop-filter: blur(10px); box-shadow: 0 12px 30px rgba(75, 53, 32, 0.08); }",
    "    .view-shell-bar { display: grid; gap: 14px; }",
    "    .view-context { display: grid; gap: 4px; }",
    "    .view-eyebrow { margin: 0; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: #7a6a5c; }",
    "    .view-mode { margin: 0; font-size: 1.9rem; }",
    "    .view-shell .meta { margin: 0; }",
    "    .filter-panel { display: grid; gap: 12px; }",
    "    .collapsible-control { display: grid; gap: 12px; }",
    "    .collapsible-toggle-input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; pointer-events: none; }",
    "    .collapsible-toggle-row { display: none; }",
    "    .collapsible-toggle-summary { margin: 0; font-size: 0.92rem; color: #5f564d; }",
    "    .collapsible-toggle-button { display: inline-flex; align-items: center; gap: 8px; width: fit-content; padding: 8px 12px; border-radius: 999px; border: 1px solid rgba(93, 46, 12, 0.16); background: rgba(255, 255, 255, 0.84); color: #5d2e0c; font-weight: 700; cursor: pointer; }",
    "    .collapsible-toggle-button::before { content: '+'; font-size: 1rem; line-height: 1; }",
    "    .collapsible-toggle-input:checked + .collapsible-toggle-row .collapsible-toggle-button::before { content: '-'; }",
    "    .collapsible-panel-body { display: block; }",
    "    .collapsible-control[data-display-mode='always'] .collapsible-toggle-row { display: flex; align-items: start; justify-content: space-between; gap: 10px; }",
    "    .collapsible-control[data-display-mode='always'] .collapsible-toggle-summary { flex: 1 1 auto; min-width: 0; }",
    "    .collapsible-control[data-display-mode='always'] .collapsible-panel-body { display: none; }",
    "    .collapsible-control[data-display-mode='always'] .collapsible-toggle-input:checked ~ .collapsible-panel-body { display: block; }",
    "    .filter-form { display: block; }",
    "    .filter-grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }",
    "    .filter-field { display: grid; gap: 6px; }",
    "    .filter-field.project-field { min-width: 220px; flex: 1 1 220px; }",
    "    .filter-field.type-field, .filter-field.status-field { min-width: 180px; flex: 0 1 220px; }",
    "    .filter-field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #7a6a5c; }",
    "    .filter-field select { width: 100%; min-width: 0; padding: 10px 12px; border: 1px solid #c9b79f; border-radius: 10px; background: #fffdf8; color: #1d1b19; font: inherit; }",
    "    .filter-field select:focus { outline: 2px solid rgba(123, 47, 20, 0.2); border-color: #7b2f14; }",
    "    .filter-actions { display: flex; align-items: end; min-height: 44px; }",
    "    .search-form { display: block; }",
    "    .search-grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }",
    "    .search-field { display: grid; gap: 6px; }",
    "    .search-field.query-field { min-width: 280px; flex: 2 1 320px; }",
    "    .search-field.project-field, .search-field.type-field { min-width: 180px; flex: 1 1 220px; }",
    "    .search-field.limit-field { width: 110px; flex: 0 0 110px; }",
    "    .search-field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #7a6a5c; }",
    "    .search-field input, .search-field select { width: 100%; min-width: 0; padding: 10px 12px; border: 1px solid #c9b79f; border-radius: 10px; background: #fffdf8; color: #1d1b19; font: inherit; }",
    "    .search-field input:focus, .search-field select:focus { outline: 2px solid rgba(123, 47, 20, 0.2); border-color: #7b2f14; }",
    "    .search-actions { display: flex; align-items: end; gap: 10px; min-height: 44px; }",
    "    .primary-button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; border: 1px solid rgba(93, 46, 12, 0.18); border-radius: 999px; background: #7b2f14; color: #fffaf5; font: inherit; font-weight: 700; cursor: pointer; }",
    "    .primary-button:hover { background: #5d2e0c; }",
    "    .icon-button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 999px; border: 1px solid rgba(93, 46, 12, 0.18); background: rgba(255, 255, 255, 0.84); color: #5d2e0c; font-size: 1.1rem; text-decoration: none; }",
    "    .icon-button:hover { background: #fff4e8; }",
    "    .state-list { margin: 0; padding-left: 20px; }",
    "    .state-list li { margin-bottom: 10px; }",
    "    .timeline-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; color: #5f564d; font-size: 0.92rem; }",
    "    .timeline-meta span { min-width: 0; }",
    "    .timeline-meta-label { margin-right: 6px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #7a6a5c; }",
    "    .timeline-results { padding: 0 2px; }",
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
    "      .view-shell { top: 0; padding: 12px; margin-bottom: 14px; }",
    "      .view-shell-bar { gap: 12px; }",
    "      .view-mode { font-size: 1.45rem; }",
      "      .filter-panel { gap: 10px; }",
      "      .collapsible-control[data-display-mode='mobile-only'] .collapsible-toggle-row { display: flex; align-items: start; justify-content: space-between; gap: 10px; }",
      "      .collapsible-control[data-display-mode='mobile-only'] .collapsible-toggle-summary { flex: 1 1 auto; min-width: 0; }",
      "      .collapsible-control[data-display-mode='mobile-only'] .collapsible-panel-body { display: none; }",
      "      .collapsible-control[data-display-mode='mobile-only'] .collapsible-toggle-input:checked ~ .collapsible-panel-body { display: block; }",
      "      .filter-grid { gap: 10px; }",
      "      .filter-field.project-field, .filter-field.type-field, .filter-field.status-field { min-width: min(100%, 180px); flex: 1 1 140px; }",
      "      .filter-actions { min-height: 40px; }",
      "      .search-grid { gap: 10px; }",
      "      .search-field.query-field, .search-field.project-field, .search-field.type-field, .search-field.limit-field { min-width: min(100%, 180px); flex: 1 1 140px; width: auto; }",
      "      .search-actions { width: 100%; justify-content: flex-start; min-height: 40px; }",
      "      .timeline-item { padding: 12px 0; }",
      "      .timeline-meta { gap: 6px 12px; font-size: 0.88rem; }",
      "      .panel { padding: 16px; }",
    "    }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    ...(showSiteHeader
      ? [
          "    <header>",
          "      <h1>Project Memory</h1>",
          "      <div class=\"meta\">Read-only Web shell over the shared core repository context.</div>",
          "    </header>",
          "    <nav><a href=\"/timeline\">Timeline</a></nav>",
        ]
      : []),
    content,
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
};

const renderTimeline = (
  view: WebTimelineView,
  timelineReturnPath: string,
  resetPath: string,
): string => {
  const timelineContext = parseTimelineContext(timelineReturnPath);
  const filterForm = renderTimelineFilterForm(
    timelineContext,
    view.availableProjects,
    resetPath,
  );
  const searchPath = createSearchQueryPath({
    from: timelineContext.normalizedPath,
    limit: timelineContext.limit,
    projectSelection: timelineContext.projectSelection,
    type: timelineContext.type,
  });
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
  const shell = [
    '<section class="view-shell">',
    '  <div class="view-shell-bar">',
    '    <div class="view-context">',
    '      <p class="view-eyebrow">Project Memory</p>',
    "      <h1 class=\"view-mode\">Timeline</h1>",
    '      <p class="meta">Read-only latest-first browsing over managed project-memory documents.</p>',
    `      <p class="meta">${escapeHtml(renderTimelineQuerySummary(view))}</p>`,
    renderActionLinks([{ href: searchPath, label: "Search documents" }]).split("\n").map((line) => `      ${line}`).join("\n"),
    "    </div>",
    '    <div class="filter-panel">',
    renderCollapsibleControl({
      body: filterForm,
      buttonLabel: "Filters",
      controlId: "timeline-filter-toggle",
      defaultExpanded: false,
      displayMode: "mobile-only",
      summary: renderTimelineFilterSummary(timelineContext),
    }).split("\n").map((line) => `      ${line}`).join("\n"),
    "    </div>",
    "  </div>",
    "</section>",
  ].join("\n");
  const items = view.rows.length === 0
    ? [
        shell,
        '<section class="panel">',
        `  <h2>${escapeHtml(emptyStateTitle)}</h2>`,
        `  <p>${escapeHtml(emptyStateMessage)}</p>`,
        "</section>",
        invalidDocumentPanel,
      ].filter((section) => section.length > 0).join("\n")
    : [
        shell,
        invalidDocumentPanel,
        '<section class="timeline-results" aria-label="Timeline results">',
        '  <ul class="timeline-list">',
        ...view.rows.map((document) => {
          const showRecordedAt = hasPreciseRecordedAt(document.date, document.recordedAt);
          const metadataEntries = [
            { label: "Type", value: document.type },
            { label: "Project", value: document.project },
            { label: "Status", value: document.status },
            { label: "Date", value: document.date },
            ...(showRecordedAt
              ? [{ label: "Recorded At", value: formatRecordedAtForDisplay(document.recordedAt ?? "") }]
              : []),
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
            '    <li class="timeline-item">',
            `      <h3 class="timeline-title"><a href="${escapeHtml(documentHref)}">${escapeHtml(document.topic)}</a></h3>`,
            renderTimelinePreview(document.preview).split("\n").map((line) => `      ${line}`).join("\n"),
            renderTimelineInlineMetadata(metadataEntries).split("\n").map((line) => `      ${line}`).join("\n"),
            "    </li>",
          ].join("\n");
        }),
        "  </ul>",
        "</section>",
      ].join("\n");

  return renderHtmlPage(
    "Project Memory Timeline",
    `<div class="page-stack">${items}</div>`,
    { showSiteHeader: false },
  );
};

const renderSearch = (
  view: WebSearchView,
  searchReturnPath: string,
  resetPath: string,
): string => {
  const searchContext = parseSearchContext(searchReturnPath);
  const searchForm = renderSearchForm(
    searchContext,
    view.availableProjects,
    resetPath,
  );
  const collapsibleForm = renderCollapsibleControl({
    body: searchForm,
    buttonLabel: "Search options",
    controlId: "search-form-toggle",
    defaultExpanded: !searchContext.hasExecutedQuery,
    displayMode: "always",
    summary: renderSearchFilterSummary(searchContext),
  });
  const emptyStateTitle = searchContext.hasExecutedQuery
    ? "No Matching Results"
    : "Search the Corpus";
  const emptyStateMessage = searchContext.hasExecutedQuery
    ? "No managed documents matched the current search query."
    : "Enter a query or narrow by project and type to search active managed documents.";
  const shell = [
    '<section class="view-shell">',
    '  <div class="view-shell-bar">',
    '    <div class="view-context">',
    '      <p class="view-eyebrow">Project Memory</p>',
    "      <h1 class=\"view-mode\">Search</h1>",
    '      <p class="meta">Read-only search over the existing shared-core substring query surface.</p>',
    `      <p class="meta">${escapeHtml(renderSearchQuerySummary(view, searchContext.hasExecutedQuery))}</p>`,
    renderActionLinks([{ href: searchContext.backPath, label: "Back to timeline" }]).split("\n").map((line) => `      ${line}`).join("\n"),
    "    </div>",
    collapsibleForm.split("\n").map((line) => `    ${line}`).join("\n"),
    "  </div>",
    "</section>",
  ].join("\n");

  if (view.results.length === 0) {
    return renderHtmlPage(
      "Project Memory Search",
      [
        '<div class="page-stack">',
        shell,
        '<section class="panel">',
        `  <h2>${escapeHtml(emptyStateTitle)}</h2>`,
        `  <p>${escapeHtml(emptyStateMessage)}</p>`,
        "</section>",
        "</div>",
      ].join("\n"),
      { showSiteHeader: false },
    );
  }

  return renderHtmlPage(
    "Project Memory Search",
    [
      '<div class="page-stack">',
      shell,
      '<section class="timeline-results" aria-label="Search results">',
      '  <ul class="timeline-list">',
      ...view.results.map((document) => {
        const showRecordedAt = hasPreciseRecordedAt(document.date, document.recordedAt);
        const metadataEntries = [
          { label: "Type", value: document.type },
          { label: "Project", value: document.project },
          { label: "Status", value: document.status },
          { label: "Date", value: document.date },
          ...(showRecordedAt
            ? [{ label: "Recorded At", value: formatRecordedAtForDisplay(document.recordedAt ?? "") }]
            : []),
          { label: "Path", value: document.relativePath },
        ];
        const documentHref = createDocumentHref(document.routePath, searchContext.normalizedPath);

        return [
          '    <li class="timeline-item">',
          `      <h3 class="timeline-title"><a href="${escapeHtml(documentHref)}">${escapeHtml(document.topic)}</a></h3>`,
          '      <div class="timeline-preview" aria-label="Search excerpt">',
          `        <p class="timeline-preview-primary">${escapeHtml(document.excerpt)}</p>`,
          "      </div>",
          renderTimelineInlineMetadata(metadataEntries).split("\n").map((line) => `      ${line}`).join("\n"),
          "    </li>",
        ].join("\n");
      }),
      "  </ul>",
      "</section>",
      "</div>",
    ].join("\n"),
    { showSiteHeader: false },
  );
};

const renderDocumentView = (
  document: WebDocumentDetail,
  returnPath: string,
): string => {
  const returnContext = parseReturnContext(returnPath);
  const showRecordedAt = hasPreciseRecordedAt(document.date, document.recordedAt);
  const metadataEntries = [
    { label: "Topic", value: document.topic },
    { label: "Type", value: document.type },
    { label: "Project", value: document.project },
    { label: "Status", value: document.status },
    { label: "Date", value: document.date },
    ...(showRecordedAt
      ? [{ label: "Recorded At", value: formatRecordedAtForDisplay(document.recordedAt ?? "") }]
      : []),
    { label: "Path", value: document.relativePath },
  ];

  return renderHtmlPage(
    document.topic,
    [
      '<section class="page-intro panel">',
      renderBreadcrumbs([
        { href: returnContext.normalizedPath, label: returnContext.rootLabel },
        { label: document.topic },
      ]).split("\n").map((line) => `  ${line}`).join("\n"),
      `  <h2>${escapeHtml(document.topic)}</h2>`,
      '  <p class="meta">Exact managed document view resolved through the shared-core read surface.</p>',
      `  ${renderTagList(returnContext.activeFilters, returnContext.kind === "search" ? "Opened directly from the search surface." : "Opened from the unfiltered timeline view.")}`,
      renderActionLinks([
        { href: returnContext.normalizedPath, label: returnContext.backLabel },
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
  returnPath: string = TimelineRoutePath,
): WebResponsePayload => {
  const returnContext = parseReturnContext(returnPath);
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
        : [{ href: returnContext.normalizedPath, label: returnContext.backLabel }],
      breadcrumbs: [
        { href: returnContext.normalizedPath, label: returnContext.rootLabel },
        { label: title },
      ],
      metadataEntries: returnContext.activeFilters,
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
  const returnPath = normalizeReturnPath(requestUrl.searchParams.get("from"));
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
      const rawProjectSelection = requestUrl.searchParams.get("project")?.trim() ?? undefined;
      const timelineQuery = normalizeWebTimelineQuery({
        limit: requestUrl.searchParams.get("limit") ?? undefined,
        project: rawProjectSelection,
        status: requestUrl.searchParams.get("status") ?? undefined,
        type: requestUrl.searchParams.get("type") ?? undefined,
      });
      const rawStatus = requestUrl.searchParams.get("status")?.trim() ?? undefined;
      const rawType = requestUrl.searchParams.get("type")?.trim() ?? undefined;
      const shouldDefaultProject = !rawProjectSelection && !rawStatus && !rawType;
      const baselineTimelineResult = readWebTimeline(timelineQuery, context);
      const defaultProjectSelection = shouldDefaultProject
        ? baselineTimelineResult.rows[0]?.project
        : undefined;
      const effectiveTimelineQuery = defaultProjectSelection
        ? { ...timelineQuery, project: defaultProjectSelection }
        : timelineQuery;
      const effectiveProjectSelection = rawProjectSelection
        ?? defaultProjectSelection
        ?? undefined;
      const timelineResult = defaultProjectSelection
        ? readWebTimeline(effectiveTimelineQuery, context)
        : baselineTimelineResult;
      const effectiveTimelinePath = createTimelineQueryPath({
        limit: requestUrl.searchParams.get("limit")?.trim() ?? undefined,
        projectSelection: effectiveProjectSelection,
        status: effectiveTimelineQuery.status,
        type: effectiveTimelineQuery.type,
      });
      const resetPath = createTimelineQueryPath({
        limit: requestUrl.searchParams.get("limit")?.trim() ?? undefined,
        projectSelection: defaultProjectSelection,
      });

      return buildHtmlResponse(
        200,
        renderTimeline(
          timelineResult,
          shouldDefaultProject
            ? effectiveTimelinePath
            : normalizeTimelinePath(pathname, requestUrl.search),
          resetPath,
        ),
      );
    } catch (error) {
      if (isWebReadError(error)) {
        return buildReadErrorResponse(error);
      }

      throw error;
    }
  }

  if (pathname === SearchRoutePath) {
    try {
      const searchPath = normalizeSearchPath(pathname, requestUrl.search);
      const searchContext = parseSearchContext(searchPath);
      const searchQuery = normalizeWebSearchQuery({
        limit: requestUrl.searchParams.get("limit") ?? undefined,
        project: requestUrl.searchParams.get("project") ?? undefined,
        q: requestUrl.searchParams.get("q") ?? undefined,
        type: requestUrl.searchParams.get("type") ?? undefined,
      });
      const searchResult = searchContext.hasExecutedQuery
        ? readWebSearch(searchQuery, context)
        : {
            appliedQuery: searchQuery,
            availableProjects: readWebTimeline({ limit: 1 }, context).availableProjects,
            results: [],
          };
      const resetPath = createSearchQueryPath({
        from: searchContext.backPath !== TimelineRoutePath ? searchContext.backPath : undefined,
      });

      return buildHtmlResponse(200, renderSearch(searchResult, searchPath, resetPath));
    } catch (error) {
      if (isWebReadError(error)) {
        return buildReadErrorResponse(error, SearchRoutePath);
      }

      throw error;
    }
  }

  const documentRoute = decodeDocumentRoute(pathname);
  if (documentRoute.kind === "invalid") {
    const returnContext = parseReturnContext(returnPath);
    return buildHtmlResponse(
      400,
      renderErrorPage("Invalid Document", documentRoute.message, {
        actions: [{ href: returnContext.normalizedPath, label: returnContext.backLabel }],
        breadcrumbs: [
          { href: returnContext.normalizedPath, label: returnContext.rootLabel },
          { label: "Invalid Document" },
        ],
        metadataEntries: returnContext.activeFilters,
      }),
    );
  }

  if (documentRoute.kind === "matched") {
    try {
      const document = readWebDocument(documentRoute.relativePath, context);
      return buildHtmlResponse(200, renderDocumentView(document, returnPath));
    } catch (error) {
      if (isWebReadError(error)) {
        return buildReadErrorResponse(error, returnPath);
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
  try {
    const context = createRepositoryContext();
    const lifecycleConfig = resolveManagedWebServerConfig({}, context);

    return {
      context,
      host: lifecycleConfig.bind.host,
      port: lifecycleConfig.bind.port,
    };
  } catch (error) {
    const fallbackHost = process.env[ProjectMemoryWebHostEnvVar]?.trim()
      || process.env[GenericWebHostEnvVar]?.trim()
      || DefaultWebHost;
    const fallbackPort = Number.parseInt(
      process.env[ProjectMemoryWebPortEnvVar]?.trim()
        || process.env[GenericWebPortEnvVar]?.trim()
        || `${DefaultWebPort}`,
      10,
    );

    return {
      configurationError: error instanceof Error ? error.message : String(error),
      host: fallbackHost,
      port: Number.isInteger(fallbackPort) ? fallbackPort : DefaultWebPort,
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

  return server;
};
