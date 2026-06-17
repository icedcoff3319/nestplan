import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsClamped,
  dateFromDateInput,
  formatDate,
  formatDateTime,
  formatMonthKey,
  formatNumber,
  formatRupiah,
  getTimestampSortValue,
  isCurrentMonth,
  isExpired,
  toDateInput,
  toMonthInput
} from "../format-utils.js";

function timestamp(dateText) {
  const date = new Date(dateText);
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => date,
    toMillis: () => date.getTime()
  };
}

test("formats rupiah and plain numbers", () => {
  assert.equal(formatRupiah(15000), "Rp\u00a015.000");
  assert.equal(formatNumber(1234567), "1.234.567");
});

test("formats dates and date-times with app conventions", () => {
  const value = timestamp("2026-04-22T16:40:00.000Z");
  assert.match(formatDate(value), /^22 Apr 2026$/);
  assert.match(formatDateTime(value), /^22 Apr 2026, 23:40$/);
});

test("handles missing timestamps safely", () => {
  assert.equal(formatDate(null), "-");
  assert.equal(formatDateTime({}), "-");
  assert.equal(getTimestampSortValue(null), 0);
});

test("normalizes date input and month labels", () => {
  assert.equal(toDateInput(new Date("2026-06-15T05:00:00.000Z")), "2026-06-15");
  assert.equal(toMonthInput(new Date("2026-06-15T05:00:00.000Z")), "2026-06");
  assert.equal(formatMonthKey("2026-06"), "June 2026");
  assert.equal(formatMonthKey("bad"), "-");
});

test("clamps month arithmetic at month end", () => {
  assert.equal(toDateInput(addMonthsClamped(new Date("2026-01-31T12:00:00"), 1)), "2026-02-28");
});

test("date input helper uses app noon convention", () => {
  assert.equal(dateFromDateInput("2026-04-03").getHours(), 12);
});

test("checks current month and expiry with injectable current time", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  assert.equal(isCurrentMonth(timestamp("2026-06-01T00:00:00.000Z"), now), true);
  assert.equal(isCurrentMonth(timestamp("2026-05-15T00:00:00.000Z"), now), false);
  assert.equal(isExpired(timestamp("2026-06-14T00:00:00.000Z"), now.getTime()), true);
  assert.equal(isExpired(timestamp("2026-06-16T00:00:00.000Z"), now.getTime()), false);
});
