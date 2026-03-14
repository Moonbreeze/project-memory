/**
 * Parses one optional boolean string encoded as `true` or `false`.
 */
export const parseBooleanString = (
  value: string | undefined,
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Boolean values must use true or false, received: ${value}`);
};
