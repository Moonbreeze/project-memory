const orderedListItemPattern = /^\d+\.\s+(.*)$/;
const unorderedListItemPattern = /^[-*]\s+(.*)$/;
const headingPattern = /^(#{1,6})\s+(.*)$/;

const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const isBlankLine = (line: string): boolean => {
  return line.trim().length === 0;
};

const isCodeFence = (line: string): boolean => {
  return line.trim().startsWith("```");
};

const isBlockBoundary = (line: string): boolean => {
  return (
    isBlankLine(line) ||
    isCodeFence(line) ||
    headingPattern.test(line) ||
    unorderedListItemPattern.test(line) ||
    orderedListItemPattern.test(line)
  );
};

const normalizeHref = (rawHref: string): string | undefined => {
  const trimmedHref = rawHref.trim();
  if (trimmedHref.length === 0) {
    return undefined;
  }

  if (/[\u0000-\u001F\u007F\s]/.test(trimmedHref)) {
    return undefined;
  }

  if (
    trimmedHref.startsWith("#") ||
    trimmedHref.startsWith("/") ||
    trimmedHref.startsWith("./") ||
    trimmedHref.startsWith("../")
  ) {
    return trimmedHref;
  }

  const normalizedHref = trimmedHref.toLowerCase();
  if (
    normalizedHref.startsWith("http://") ||
    normalizedHref.startsWith("https://") ||
    normalizedHref.startsWith("mailto:")
  ) {
    return trimmedHref;
  }

  return undefined;
};

const renderLinksAndText = (value: string): string => {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const fragments: string[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(linkPattern)) {
    const fullMatch = match[0];
    const label = match[1];
    const href = match[2];
    const matchIndex = match.index;

    if (
      typeof fullMatch !== "string" ||
      typeof label !== "string" ||
      typeof href !== "string" ||
      matchIndex === undefined
    ) {
      continue;
    }

    fragments.push(escapeHtml(value.slice(lastIndex, matchIndex)));

    const normalizedHref = normalizeHref(href);
    if (normalizedHref) {
      fragments.push(
        `<a href="${escapeHtml(normalizedHref)}">${escapeHtml(label)}</a>`,
      );
    } else {
      fragments.push(escapeHtml(fullMatch));
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  fragments.push(escapeHtml(value.slice(lastIndex)));

  return fragments.join("");
};

const renderInlineMarkdown = (value: string): string => {
  const fragments: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const codeStart = value.indexOf("`", cursor);
    if (codeStart === -1) {
      fragments.push(renderLinksAndText(value.slice(cursor)));
      break;
    }

    const codeEnd = value.indexOf("`", codeStart + 1);
    if (codeEnd === -1) {
      fragments.push(renderLinksAndText(value.slice(cursor)));
      break;
    }

    fragments.push(renderLinksAndText(value.slice(cursor, codeStart)));
    fragments.push(`<code>${escapeHtml(value.slice(codeStart + 1, codeEnd))}</code>`);
    cursor = codeEnd + 1;
  }

  return fragments.join("");
};

const renderCodeBlock = (lines: ReadonlyArray<string>): string => {
  return `<pre><code>${escapeHtml(lines.join("\n"))}</code></pre>`;
};

const renderList = (
  lines: ReadonlyArray<string>,
  kind: "ordered" | "unordered",
): string => {
  const itemPattern = kind === "ordered" ? orderedListItemPattern : unorderedListItemPattern;
  const tagName = kind === "ordered" ? "ol" : "ul";

  return [
    `<${tagName}>`,
    ...lines.map((line) => {
      const match = line.match(itemPattern);
      const itemText = match?.[1]?.trim() ?? line.trim();
      return `  <li>${renderInlineMarkdown(itemText)}</li>`;
    }),
    `</${tagName}>`,
  ].join("\n");
};

/**
 * Baseline note for the first safe Markdown renderer shipped in the Web layer.
 */
export const baselineMarkdownRendererNote =
  "Baseline safe Markdown rendering supports headings, paragraphs, lists, links, inline code, and fenced code blocks. Raw HTML stays escaped until a later renderer is approved.";

/**
 * Renders a safe HTML projection for managed Markdown bodies.
 */
export const renderMarkdownToHtml = (markdown: string): string => {
  const normalizedMarkdown = markdown.replaceAll("\r\n", "\n");
  const lines = normalizedMarkdown.split("\n");
  const blocks: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (isBlankLine(line)) {
      index += 1;
      continue;
    }

    if (isCodeFence(line)) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !isCodeFence(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(renderCodeBlock(codeLines));
      continue;
    }

    const headingMatch = line.match(headingPattern);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].trim();
      blocks.push(`<h${String(level)}>${renderInlineMarkdown(content)}</h${String(level)}>`);
      index += 1;
      continue;
    }

    const isUnorderedList = unorderedListItemPattern.test(line);
    const isOrderedList = orderedListItemPattern.test(line);
    if (isUnorderedList || isOrderedList) {
      const listKind = isOrderedList ? "ordered" : "unordered";
      const listLines: string[] = [];

      while (index < lines.length) {
        const candidateLine = lines[index] ?? "";
        if (listKind === "ordered" && !orderedListItemPattern.test(candidateLine)) {
          break;
        }

        if (listKind === "unordered" && !unorderedListItemPattern.test(candidateLine)) {
          break;
        }

        listLines.push(candidateLine);
        index += 1;
      }

      blocks.push(renderList(listLines, listKind));
      continue;
    }

    const paragraphLines: string[] = [line.trim()];
    index += 1;

    while (index < lines.length) {
      const candidateLine = lines[index] ?? "";
      if (isBlockBoundary(candidateLine)) {
        break;
      }

      paragraphLines.push(candidateLine.trim());
      index += 1;
    }

    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("\n");
};
