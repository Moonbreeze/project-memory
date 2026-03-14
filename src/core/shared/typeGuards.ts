/**
 * Returns `true` when `value` belongs to one literal string tuple.
 */
export const isLiteralMember = <T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] => {
  return typeof value === "string" && values.includes(value);
};
