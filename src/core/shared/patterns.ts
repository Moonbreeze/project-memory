/**
 * Regex-source fragment for one kebab-case slug segment.
 */
export const kebabCaseSlugPatternSource = "[a-z0-9]+(?:-[a-z0-9]+)*";

/**
 * Regex-source fragment for one `YYYY-MM-DD` date.
 */
export const isoDatePatternSource = "\\d{4}-\\d{2}-\\d{2}";

/**
 * Compiled regex for validating one kebab-case slug.
 */
export const kebabCaseSlugPattern = new RegExp(`^${kebabCaseSlugPatternSource}$`);

/**
 * Compiled regex for validating one `YYYY-MM-DD` date string.
 */
export const isoDatePattern = new RegExp(`^${isoDatePatternSource}$`);
