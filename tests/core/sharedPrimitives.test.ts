import assert from "node:assert/strict";
import test from "node:test";

import {
  isLiteralMember,
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
