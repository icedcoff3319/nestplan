import {
  formatDateTime,
  getTimestampSortValue
} from "./format-utils.js?v=20260620c";

const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_REGISTRATION_EXPIRY_DAYS = 14;
const MIN_REGISTRATION_EXPIRY_DAYS = 1;
const MAX_REGISTRATION_EXPIRY_DAYS = 60;

function generateAccessCode(length, randomSource = globalThis.crypto) {
  if (!randomSource?.getRandomValues) {
    throw new Error("Secure random source is not available.");
  }

  const bytes = randomSource.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byte => ACCESS_CODE_ALPHABET[byte % ACCESS_CODE_ALPHABET.length]).join("");
}

export function cleanInviteCode(code = "") {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateInviteCode(randomSource) {
  return generateAccessCode(6, randomSource);
}

export function generateRegistrationCode(length = 8, randomSource) {
  return generateAccessCode(length, randomSource);
}

export function clampRegistrationExpiryDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_REGISTRATION_EXPIRY_DAYS;
  }
  return Math.max(
    MIN_REGISTRATION_EXPIRY_DAYS,
    Math.min(MAX_REGISTRATION_EXPIRY_DAYS, Math.floor(parsed))
  );
}

export function serializeRegistrationCode(id, data = {}) {
  return {
    id,
    code: data.code || id,
    emailNormalized: data.emailNormalized || "",
    status: data.status || "unused",
    note: data.note || "",
    createdAtSort: getTimestampSortValue(data.createdAt),
    createdAtFormatted: formatDateTime(data.createdAt),
    expiresAtFormatted: formatDateTime(data.expiresAt),
    consumedAtFormatted: formatDateTime(data.consumedAt),
    revokedAtFormatted: formatDateTime(data.revokedAt)
  };
}

export function serializeEmailOverride(id, data = {}) {
  return {
    id,
    emailNormalized: data.emailNormalized || id,
    status: data.status || "active",
    createdAtSort: getTimestampSortValue(data.createdAt),
    createdAtFormatted: formatDateTime(data.createdAt)
  };
}

export function serializeBlockedDomain(id, data = {}) {
  return {
    id,
    domain: data.domain || id,
    status: data.status || "active",
    createdAtSort: getTimestampSortValue(data.createdAt),
    createdAtFormatted: formatDateTime(data.createdAt)
  };
}
