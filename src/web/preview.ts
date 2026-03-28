import type { DocumentType } from "../core/index.ts";

import type { WebDocumentPreview } from "./types.ts";

const sectionHeadingPattern = /^##\s+(.*)$/;
const orderedListItemPattern = /^\d+\.\s+(.*)$/;
const unorderedListItemPattern = /^[-*]\s+(.*)$/;
const fallbackPreviewText = "No semantic preview available.";
const maxPreviewLength = 180;

const normalizeSectionHeading = (value: string): string => {
  return value.trim().toLowerCase();
};

const truncatePreviewText = (value: string): string => {
  if (value.length <= maxPreviewLength) {
    return value;
  }

  const truncatedValue = value.slice(0, maxPreviewLength + 1);
  const lastWordBoundary = truncatedValue.lastIndexOf(" ");
  if (lastWordBoundary < 80) {
    return `${value.slice(0, maxPreviewLength).trimEnd()}...`;
  }

  return `${truncatedValue.slice(0, lastWordBoundary).trimEnd()}...`;
};

const normalizeMarkdownToPreviewText = (value: string): string => {
  const normalizedWhitespace = value.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!normalizedWhitespace) {
    return "";
  }

  return normalizedWhitespace
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
};

const extractFirstPreviewBlock = (markdown: string): string | undefined => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const paragraphLines: string[] = [];
  let isInsideCodeFence = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("```")) {
      isInsideCodeFence = !isInsideCodeFence;
      if (paragraphLines.length > 0) {
        break;
      }

      continue;
    }

    if (isInsideCodeFence) {
      continue;
    }

    if (trimmedLine.length === 0) {
      if (paragraphLines.length > 0) {
        break;
      }

      continue;
    }

    if (trimmedLine.startsWith("#")) {
      if (paragraphLines.length > 0) {
        break;
      }

      continue;
    }

    const orderedListMatch = trimmedLine.match(orderedListItemPattern);
    if (orderedListMatch?.[1]) {
      return truncatePreviewText(normalizeMarkdownToPreviewText(orderedListMatch[1]));
    }

    const unorderedListMatch = trimmedLine.match(unorderedListItemPattern);
    if (unorderedListMatch?.[1]) {
      return truncatePreviewText(normalizeMarkdownToPreviewText(unorderedListMatch[1]));
    }

    paragraphLines.push(trimmedLine);
  }

  const paragraphText = normalizeMarkdownToPreviewText(paragraphLines.join(" "));
  if (!paragraphText) {
    return undefined;
  }

  return truncatePreviewText(paragraphText);
};

const extractSectionBodies = (markdown: string): Map<string, string> => {
  const sectionBodies = new Map<string, string>();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let currentSection: string | undefined;
  let currentLines: string[] = [];

  const flushCurrentSection = (): void => {
    if (!currentSection) {
      return;
    }

    sectionBodies.set(currentSection, currentLines.join("\n").trim());
  };

  for (const line of lines) {
    const sectionHeadingMatch = line.match(sectionHeadingPattern);
    if (sectionHeadingMatch?.[1]) {
      flushCurrentSection();
      currentSection = normalizeSectionHeading(sectionHeadingMatch[1]);
      currentLines = [];
      continue;
    }

    if (!currentSection) {
      continue;
    }

    currentLines.push(line);
  }

  flushCurrentSection();
  return sectionBodies;
};

const previewSectionPreferences: Record<DocumentType, { primary: string[]; secondary: string[] }> = {
  "canonical-doc": {
    primary: ["summary"],
    secondary: ["guidance"],
  },
  decision: {
    primary: ["decision"],
    secondary: ["consequences"],
  },
  "provider-note": {
    primary: ["overview"],
    secondary: ["guidance"],
  },
  runbook: {
    primary: ["purpose"],
    secondary: ["procedure"],
  },
  "session-note": {
    primary: ["summary"],
    secondary: ["actions"],
  },
  "verification-result": {
    primary: ["result"],
    secondary: ["scope"],
  },
  "work-item": {
    primary: ["summary"],
    secondary: ["outcome"],
  },
};

const selectSectionPreview = (
  sectionBodies: Map<string, string>,
  headings: string[],
): string | undefined => {
  for (const heading of headings) {
    const sectionBody = sectionBodies.get(heading);
    if (!sectionBody) {
      continue;
    }

    const previewText = extractFirstPreviewBlock(sectionBody);
    if (previewText) {
      return previewText;
    }
  }

  return undefined;
};

/**
 * Extracts a compact semantic preview for one Web timeline row.
 */
export const extractSemanticPreview = (
  documentType: DocumentType,
  markdownBody: string,
): WebDocumentPreview => {
  const sectionBodies = extractSectionBodies(markdownBody);
  const preferences = previewSectionPreferences[documentType];
  const primary =
    selectSectionPreview(sectionBodies, preferences.primary)
    ?? extractFirstPreviewBlock(markdownBody)
    ?? fallbackPreviewText;
  const secondary = selectSectionPreview(sectionBodies, preferences.secondary);

  if (!secondary || secondary === primary) {
    return { primary };
  }

  return {
    primary,
    secondary,
  };
};
