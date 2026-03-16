/**
 * Returns `true` when `value` belongs to one literal string tuple.
 */
export const isLiteralMember = <T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] => {
  return typeof value === "string" && values.includes(value);
};

/**
 * Returns `true` when `value` is a plain record object.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
