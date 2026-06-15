import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCsv,
  buildExportFilename,
  csvEscape,
  readExportField,
  sanitizeFilenamePart
} from "../csv-export.js";

const mockTimestamp = value => ({
  toDate: () => new Date(value)
});

const options = {
  formatDateTime: timestamp => timestamp?.toDate?.().toISOString().slice(0, 10) || "",
  getMemberName: userId => ({
    userA: "Ayu",
    ownerA: "Bima",
    ownerB: "Citra"
  }[userId] || "")
};

test("csvEscape quotes commas, quotes, and new lines", () => {
  assert.equal(csvEscape("Food, cafe"), "\"Food, cafe\"");
  assert.equal(csvEscape("He said \"hi\""), "\"He said \"\"hi\"\"\"");
  assert.equal(csvEscape("Line 1\nLine 2"), "\"Line 1\nLine 2\"");
});

test("sanitizeFilenamePart removes invalid filename characters", () => {
  assert.equal(sanitizeFilenamePart(" Akhdan / Test:* "), "Akhdan-Test");
  assert.equal(sanitizeFilenamePart(""), "User");
});

test("buildExportFilename uses display name and timestamp", () => {
  const now = new Date("2026-06-15T09:08:07");
  assert.equal(buildExportFilename("Test User", now), "NestPlan-Test-User-20260615-090807.csv");
});

test("readExportField uses snapshots and supplied lookup helpers", () => {
  const row = {
    id: "tx1",
    displayKind: "adjustment",
    transactionAt: mockTimestamp("2026-06-14T00:00:00Z"),
    createdAt: mockTimestamp("2026-06-15T00:00:00Z"),
    createdByUserId: "userA",
    accountNameSnapshot: "Mandiri",
    accountPrimaryOwnerUserIdSnapshot: "ownerA",
    counterpartyAccountNameSnapshot: "BCA",
    counterpartyAccountPrimaryOwnerUserIdSnapshot: "ownerB",
    categoryNameSnapshot: "Essentials - Food"
  };

  assert.equal(readExportField(row, "displayKindLabel", options), "Balance correction");
  assert.equal(readExportField(row, "transactionAtFormatted", options), "2026-06-14");
  assert.equal(readExportField(row, "createdAtFormatted", options), "2026-06-15");
  assert.equal(readExportField(row, "createdByDisplayName", options), "Ayu");
  assert.equal(readExportField(row, "accountOwnerDisplayName", options), "Bima");
  assert.equal(readExportField(row, "counterpartyAccountOwnerDisplayName", options), "Citra");
  assert.equal(readExportField(row, "categoryName", options), "Essentials - Food");
});

test("buildCsv writes friendly headers and escaped row values", () => {
  const csv = buildCsv([
    {
      displayKind: "outcome",
      postingKind: "outcome",
      transactionAt: mockTimestamp("2026-06-14T00:00:00Z"),
      createdAt: mockTimestamp("2026-06-15T00:00:00Z"),
      amountMinor: 45000,
      currencyCode: "IDR",
      createdByUserId: "userA",
      accountNameSnapshot: "Mandiri",
      accountPrimaryOwnerUserIdSnapshot: "ownerA",
      counterpartyAccountNameSnapshot: "",
      counterpartyAccountPrimaryOwnerUserIdSnapshot: "",
      categoryNameSnapshot: "Essentials - Food",
      note: "Lunch, cafe"
    }
  ], options);

  assert.match(csv, /^Transaction type,Posting type,Transaction date/);
  assert.match(csv, /Outcome,outcome,2026-06-14,2026-06-15,45000,IDR,Ayu,Mandiri,Bima,,,Essentials - Food,"Lunch, cafe"/);
});
