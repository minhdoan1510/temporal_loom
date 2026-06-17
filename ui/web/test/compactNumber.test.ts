import test from "node:test";
import assert from "node:assert/strict";
import { formatCompactNumber } from "../src/lib/compact-number.ts";

test("formatCompactNumber keeps small values readable", () => {
  assert.equal(formatCompactNumber(42), "42");
  assert.equal(formatCompactNumber(42.5), "42.5");
});

test("formatCompactNumber shortens large values with Vietnamese units", () => {
  assert.equal(formatCompactNumber(18_504_000_000), "18,5 tỷ");
  assert.equal(formatCompactNumber(1_500_000), "1,5 triệu");
  assert.equal(formatCompactNumber(12_000), "12 nghìn");
});
