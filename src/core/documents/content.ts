import fs from "node:fs";
import path from "node:path";

import type { Frontmatter, RepositoryContext } from "../types/index.ts";

type RenderData = Record<string, string>;

export type ParsedFrontmatter = {
  metadata: Record<string, string>;
  body: string;
};

/**
 * Renders a Markdown bullet list.
 */
export const renderList = (items: string[]): string => {
  return items.length === 0 ? "- none" : items.map((item) => `- ${item}`).join("\n");
};

/**
 * Loads a document template from the repository template directory.
 */
export const loadTemplate = (
  context: RepositoryContext,
  templateName: string,
): string => {
  const templatePath = path.join(context.templatesDir, templateName);
  return fs.readFileSync(templatePath, "utf8");
};

/**
 * Replaces `{{placeholder}}` tokens in a template with string values.
 */
export const renderTemplate = (template: string, data: RenderData): string => {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => data[key] ?? "");
};

/**
 * Serializes validated frontmatter into a Markdown header block.
 */
export const buildFrontmatter = (frontmatter: Frontmatter): string => {
  const lines = [
    "---",
    `date: ${frontmatter.date}`,
  ];

  if (frontmatter.recorded_at) {
    lines.push(`recorded_at: ${frontmatter.recorded_at}`);
  }

  lines.push(`project: ${frontmatter.project}`, `topic: ${frontmatter.topic}`);

  if (frontmatter.registry_scope) {
    lines.push(`registry_scope: ${frontmatter.registry_scope}`);
  }

  lines.push(`source: ${frontmatter.source}`, `status: ${frontmatter.status}`);

  if (frontmatter.work_item_state) {
    lines.push(`work_item_state: ${frontmatter.work_item_state}`);
  }

  lines.push("---", "");
  return lines.join("\n");
};

/**
 * Parses a Markdown document into raw frontmatter and body strings.
 */
export const parseFrontmatter = (raw: string): ParsedFrontmatter => {
  if (!raw.startsWith("---\n")) {
    throw new Error("Document is missing YAML frontmatter");
  }

  const closingIndex = raw.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    throw new Error("Document frontmatter is not closed");
  }

  const header = raw.slice(4, closingIndex);
  const body = raw.slice(closingIndex + 5);
  const metadata: Record<string, string> = {};

  for (const line of header.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    metadata[key] = value;
  }

  return { metadata, body: body.trimStart() };
};
