import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanInviteCode,
  clampRegistrationExpiryDays,
  generateInviteCode,
  generateRegistrationCode,
  serializeBlockedDomain,
  serializeEmailOverride,
  serializeRegistrationCode
} from "../access-utils.js";

function fakeRandom(values) {
  return {
    getRandomValues(bytes) {
      bytes.set(values.slice(0, bytes.length));
      return bytes;
    }
  };
}

function timestamp(dateText) {
  const date = new Date(dateText);
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => date,
    toMillis: () => date.getTime()
  };
}

test("cleans invite codes for user input", () => {
  assert.equal(cleanInviteCode(" ab-c 123!* "), "ABC123");
});

test("generates deterministic access codes when a random source is injected", () => {
  const source = fakeRandom([0, 1, 2, 3, 4, 5, 6, 7]);

  assert.equal(generateInviteCode(source), "ABCDEF");
  assert.equal(generateRegistrationCode(8, source), "ABCDEFGH");
});

test("clamps registration expiry days", () => {
  assert.equal(clampRegistrationExpiryDays("bad"), 14);
  assert.equal(clampRegistrationExpiryDays(0), 1);
  assert.equal(clampRegistrationExpiryDays(61), 60);
  assert.equal(clampRegistrationExpiryDays(7.9), 7);
});

test("serializes registration codes for admin display", () => {
  const code = serializeRegistrationCode("ABC123", {
    emailNormalized: "tester@example.com",
    note: "Batch 1",
    createdAt: timestamp("2026-06-20T03:00:00.000Z"),
    expiresAt: timestamp("2026-06-21T03:00:00.000Z")
  });

  assert.equal(code.id, "ABC123");
  assert.equal(code.code, "ABC123");
  assert.equal(code.emailNormalized, "tester@example.com");
  assert.equal(code.status, "unused");
  assert.equal(code.note, "Batch 1");
  assert.equal(code.createdAtSort, new Date("2026-06-20T03:00:00.000Z").getTime());
  assert.match(code.createdAtFormatted, /^20 Jun 2026, 10:00$/);
  assert.match(code.expiresAtFormatted, /^21 Jun 2026, 10:00$/);
});

test("serializes email policy records for admin display", () => {
  const createdAt = timestamp("2026-06-20T03:00:00.000Z");
  const override = serializeEmailOverride("approved@example.com", { createdAt });
  const blockedDomain = serializeBlockedDomain("example.test", { createdAt });

  assert.equal(override.emailNormalized, "approved@example.com");
  assert.equal(override.status, "active");
  assert.equal(blockedDomain.domain, "example.test");
  assert.equal(blockedDomain.status, "active");
  assert.equal(blockedDomain.createdAtSort, createdAt.toMillis());
});
