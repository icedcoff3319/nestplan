export function cleanText(text = "") {
  return text.trim();
}

export function sanitizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.filter(value => typeof value === "string" && value.trim()).map(value => value.trim());
}

export function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

export function getEmailDomain(email) {
  return normalizeEmail(email).split("@").pop() || "";
}

export function normalizeDomain(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/[^a-z0-9.-]/g, "");
}

export function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
