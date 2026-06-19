import test from "node:test";
import assert from "node:assert/strict";
import {
  capitalize,
  cleanText,
  escapeHtml,
  getEmailDomain,
  normalizeDomain,
  normalizeEmail,
  sanitizeStringArray
} from "../text-utils.js";

test("cleans and normalizes text values", () => {
  assert.equal(cleanText("  Hello NestPlan  "), "Hello NestPlan");
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(getEmailDomain("Tester@Example.COM"), "example.com");
  assert.equal(capitalize("transfer"), "Transfer");
  assert.equal(capitalize(""), "");
});

test("normalizes domains for email policy storage", () => {
  assert.equal(normalizeDomain(" https://www.Example.COM/path?q=1 "), "example.com");
  assert.equal(normalizeDomain("mail.example.com!!"), "mail.example.com");
});

test("sanitizes string arrays without keeping blanks or non-strings", () => {
  assert.deepEqual(sanitizeStringArray([" Food ", "", null, "Transport", 123, "  "]), ["Food", "Transport"]);
  assert.deepEqual(sanitizeStringArray("not an array"), []);
});

test("escapes html-sensitive characters", () => {
  assert.equal(
    escapeHtml(`<button title="A&B">'Pay'</button>`),
    "&lt;button title=&quot;A&amp;B&quot;&gt;&#39;Pay&#39;&lt;/button&gt;"
  );
});
