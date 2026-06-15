export const LEDGER_EXPORT_COLUMNS = [
  { label: "Transaction type", field: "displayKindLabel" },
  { label: "Posting type", field: "postingKind" },
  { label: "Transaction date", field: "transactionAtFormatted" },
  { label: "Created date", field: "createdAtFormatted" },
  { label: "Amount", field: "amountMinor" },
  { label: "Currency", field: "currencyCode" },
  { label: "Created by", field: "createdByDisplayName" },
  { label: "Account", field: "accountName" },
  { label: "Account owner", field: "accountOwnerDisplayName" },
  { label: "Counterparty account", field: "counterpartyAccountName" },
  { label: "Counterparty owner", field: "counterpartyAccountOwnerDisplayName" },
  { label: "Category", field: "categoryName" },
  { label: "Note", field: "note" }
];

export function buildExportFilename(displayName = "User", now = new Date()) {
  const safeDisplayName = sanitizeFilenamePart(displayName || "User");
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("");
  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  return `NestPlan-${safeDisplayName}-${datePart}-${timePart}.csv`;
}

export function sanitizeFilenamePart(value = "") {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "User";
}

export function buildCsv(rows, options = {}) {
  const columns = options.columns || LEDGER_EXPORT_COLUMNS;
  return [
    columns.map(column => csvEscape(column.label)).join(","),
    ...rows.map(row => columns.map(column => csvEscape(readExportField(row, column.field, options))).join(","))
  ].join("\n");
}

export function readExportField(row, header, options = {}) {
  const formatDateTime = options.formatDateTime || (() => "");
  const getMemberName = options.getMemberName || (() => "");
  if (header === "transactionAt") {
    return row.transactionAt?.toDate ? row.transactionAt.toDate().toISOString() : "";
  }
  if (header === "transactionAtFormatted") {
    return formatDateTime(row.transactionAt);
  }
  if (header === "createdAt") {
    return row.createdAt?.toDate ? row.createdAt.toDate().toISOString() : "";
  }
  if (header === "createdAtFormatted") {
    return formatDateTime(row.createdAt);
  }
  if (header === "transactionId") {
    return row.id || "";
  }
  if (header === "displayKindLabel") {
    return row.displayKind === "adjustment" ? "Balance correction" : capitalize(row.displayKind || "");
  }
  if (header === "createdByDisplayName") {
    return getMemberName(row.createdByUserId);
  }
  if (header === "accountName") {
    return row.accountNameSnapshot || "";
  }
  if (header === "accountOwnerUserId") {
    return row.accountPrimaryOwnerUserIdSnapshot || "";
  }
  if (header === "accountOwnerDisplayName") {
    return getMemberName(row.accountPrimaryOwnerUserIdSnapshot);
  }
  if (header === "counterpartyAccountName") {
    return row.counterpartyAccountNameSnapshot || "";
  }
  if (header === "counterpartyAccountOwnerUserId") {
    return row.counterpartyAccountPrimaryOwnerUserIdSnapshot || "";
  }
  if (header === "counterpartyAccountOwnerDisplayName") {
    return getMemberName(row.counterpartyAccountPrimaryOwnerUserIdSnapshot);
  }
  if (header === "categoryName") {
    return row.categoryNameSnapshot || "";
  }
  return row[header] ?? "";
}

export function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
