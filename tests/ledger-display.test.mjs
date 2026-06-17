import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryDisplay
} from "../ledger-display.js";

const formatters = {
  formatDate: () => "22 Apr 2026",
  formatDateTime: () => "22 Apr 2026, 23.40"
};

test("builds income/outcome history display with note fallback last", () => {
  const display = buildHistoryDisplay({
    kind: "outcome",
    categoryName: "Food",
    accountName: "Mandiri",
    note: ""
  }, formatters);

  assert.equal(display.title, "Food");
  assert.deepEqual(display.subtitleParts, [
    "22 Apr 2026",
    "Mandiri",
    "Created 22 Apr 2026, 23.40",
    "-"
  ]);
});

test("builds transfer history display with route in title and subtitle", () => {
  const display = buildHistoryDisplay({
    kind: "transfer",
    fromAccountName: "BCA",
    toAccountName: "Saving",
    note: "Reserve"
  }, formatters);

  assert.equal(display.title, "BCA to Saving");
  assert.equal(display.subtitle, "22 Apr 2026 | BCA to Saving | Created 22 Apr 2026, 23.40 | Reserve");
});

test("builds adjustment history display with clear balance correction title", () => {
  const display = buildHistoryDisplay({
    kind: "adjustment",
    accountName: "Cash",
    note: "Initial correction"
  }, formatters);

  assert.equal(display.title, "Balance correction | Cash");
  assert.equal(display.subtitle, "22 Apr 2026 | Cash | Created 22 Apr 2026, 23.40 | Initial correction");
});
