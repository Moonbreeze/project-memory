import assert from "node:assert/strict";
import test from "node:test";

import {
  isoDatePattern,
  isoDatePatternSource,
  isoUtcTimestampPattern,
  isoUtcTimestampPatternSource,
  isLiteralMember,
  kebabCaseSlugPattern,
  kebabCaseSlugPatternSource,
  parseBooleanString,
} from "../../src/core/index.ts";

test("isLiteralMember returns true only for tuple members", () => {
  const Mode = ["chat", "assistant", "code"] as const;

  assert.equal(isLiteralMember(Mode, "chat"), true);
  assert.equal(isLiteralMember(Mode, "other"), false);
  assert.equal(isLiteralMember(Mode, 1), false);
});

test("parseBooleanString parses true and false while preserving undefined", () => {
  assert.equal(parseBooleanString("true"), true);
  assert.equal(parseBooleanString("false"), false);
  assert.equal(parseBooleanString(undefined), undefined);
  assert.throws(
    () => parseBooleanString("yes"),
    /Boolean values must use true or false, received: yes/,
  );
});

test("shared regex pattern sources stay aligned with compiled slug and date validators", () => {
  assert.match("alpha-1", new RegExp(`^${kebabCaseSlugPatternSource}$`));
  assert.doesNotMatch("Alpha 1", new RegExp(`^${kebabCaseSlugPatternSource}$`));
  assert.equal(kebabCaseSlugPattern.test("alpha-1"), true);
  assert.equal(kebabCaseSlugPattern.test("Alpha 1"), false);

  assert.match("2026-03-15", new RegExp(`^${isoDatePatternSource}$`));
  assert.doesNotMatch("2026/03/15", new RegExp(`^${isoDatePatternSource}$`));
  assert.equal(isoDatePattern.test("2026-03-15"), true);
  assert.equal(isoDatePattern.test("2026/03/15"), false);

  assert.match("2026-03-15T14:23:11.482Z", new RegExp(`^${isoUtcTimestampPatternSource}$`));
  assert.doesNotMatch("2026-03-15T14:23:11Z", new RegExp(`^${isoUtcTimestampPatternSource}$`));
  assert.equal(isoUtcTimestampPattern.test("2026-03-15T14:23:11.482Z"), true);
  assert.equal(isoUtcTimestampPattern.test("2026-03-15T14:23:11Z"), false);
});
