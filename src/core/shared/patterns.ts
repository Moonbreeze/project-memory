/**
 * Regex-source fragment for one kebab-case slug segment.
 */
export const kebabCaseSlugPatternSource = "[a-z0-9]+(?:-[a-z0-9]+)*";

/**
 * Regex-source fragment for one `YYYY-MM-DD` date.
 */
export const isoDatePatternSource = "\\d{4}-\\d{2}-\\d{2}";

/**
 * Regex-source fragment for one UTC ISO 8601 timestamp with millisecond precision.
 */
export const isoUtcTimestampPatternSource = `${isoDatePatternSource}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z`;

/**
 * Compiled regex for validating one kebab-case slug.
 */
export const kebabCaseSlugPattern = new RegExp(`^${kebabCaseSlugPatternSource}$`);

/**
 * Compiled regex for validating one `YYYY-MM-DD` date string.
 */
export const isoDatePattern = new RegExp(`^${isoDatePatternSource}$`);

/**
 * Compiled regex for validating one UTC ISO 8601 timestamp string.
 */
export const isoUtcTimestampPattern = new RegExp(`^${isoUtcTimestampPatternSource}$`);
