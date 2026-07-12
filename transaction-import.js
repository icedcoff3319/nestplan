import { parseDelimitedLine } from "./category-import.js?v=20260712c";

export const TRANSACTION_IMPORT_COLUMNS = [
  "Transaction Date",
  "Type",
  "Amount",
  "Account",
  "Category",
  "To Account",
  "Saving Goal",
  "Note",
  "Fee Amount"
];

export const TRANSACTION_IMPORT_TYPES = ["income", "outcome", "transfer"];
export const TRANSACTION_IMPORT_ROW_LIMIT = 250;

const REQUIRED_HEADER_KEYS = [
  "transactiondate",
  "type",
  "amount",
  "account",
  "category",
  "toaccount",
  "savinggoal",
  "note",
  "feeamount"
];

function cleanImportText(value = "") {
  return String(value ?? "").trim();
}

function normalizeImportText(value = "") {
  return cleanImportText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeCsvHeader(value = "") {
  return normalizeImportText(value).replace(/[^a-z0-9]/g, "");
}

function parseMinorAmount(value = "") {
  const digits = cleanImportText(value).replace(/\D+/g, "");
  return digits ? Number(digits) : 0;
}

function parseTransactionDate(value = "") {
  const cleaned = cleanImportText(value);
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return cleaned;
}

function buildLookup(items = [], labelFields = []) {
  const lookup = new Map();

  items.forEach(item => {
    const keys = [
      item.id,
      ...labelFields.map(field => item[field])
    ].filter(Boolean);

    keys.forEach(key => {
      const normalized = normalizeImportText(key);
      if (!normalized) {
        return;
      }
      const existing = lookup.get(normalized) || [];
      existing.push(item);
      lookup.set(normalized, existing);
    });
  });

  return lookup;
}

function resolveUniqueReference({ lookup, rawValue, rowNumber, fieldLabel, errors }) {
  const cleaned = cleanImportText(rawValue);
  if (!cleaned) {
    return null;
  }

  const matches = lookup.get(normalizeImportText(cleaned)) || [];
  if (!matches.length) {
    errors.push(`Row ${rowNumber}: ${fieldLabel} "${cleaned}" was not found.`);
    return null;
  }
  if (matches.length > 1) {
    errors.push(`Row ${rowNumber}: ${fieldLabel} "${cleaned}" matches more than one item. Use a unique name or ID.`);
    return null;
  }
  return matches[0];
}

function isCategoryAllowedForType(category, type) {
  return category?.direction === "both" || category?.direction === type;
}

function readDescription(row, index, delimiter) {
  if (index !== Math.max(...Object.values(row.indexes))) {
    return cleanImportText(row.cells[index] || "");
  }
  return cleanImportText(row.cells.slice(index).join(delimiter));
}

export function buildTransactionImportTemplate() {
  return [
    TRANSACTION_IMPORT_COLUMNS.join(","),
    "2026-04-22,outcome,45000,BCA,Essentials - Food,,,Lunch,2500",
    "2026-04-23,income,5000000,BCA,Work - Salary,,,Salary,",
    "2026-04-24,transfer,300000,BCA,,GoPay,,Top up e-wallet,1000",
    "2026-04-25,transfer,100000,BCA,,,Emergency Fund,Reserve to saving,"
  ].join("\n");
}

export function parseTransactionImportCsv(text = "", context = {}) {
  const errors = [];
  const lines = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => cleanImportText(line));

  if (!lines.length) {
    return { rows: [], errors: ["The CSV file is empty."] };
  }

  const delimiter = lines[0].includes("|") ? "|" : ",";
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeCsvHeader);
  const indexes = Object.fromEntries(REQUIRED_HEADER_KEYS.map(key => [key, headers.indexOf(key)]));
  const missingHeaders = REQUIRED_HEADER_KEYS.filter(key => indexes[key] === -1);

  if (missingHeaders.length) {
    return {
      rows: [],
      errors: [`Use this header exactly: ${TRANSACTION_IMPORT_COLUMNS.join(", ")}.`]
    };
  }

  const rowLimit = Number(context.rowLimit || TRANSACTION_IMPORT_ROW_LIMIT);
  const dataLines = lines.slice(1);
  if (dataLines.length > rowLimit) {
    return {
      rows: [],
      errors: [`Import is limited to ${rowLimit} rows at a time.`]
    };
  }

  const activeAccounts = (context.accounts || []).filter(item => item.status === "active");
  const activeCategories = (context.categories || []).filter(item => item.status === "active");
  const fundableSavingGoals = (context.savingGoals || []).filter(item => item.status === "active");
  const accountLookup = buildLookup(activeAccounts, ["name", "displayName"]);
  const categoryLookup = buildLookup(activeCategories, ["name"]);
  const savingLookup = buildLookup(fundableSavingGoals, ["name"]);
  const rows = [];

  dataLines.forEach((line, index) => {
    const rowNumber = index + 2;
    const cells = parseDelimitedLine(line, delimiter);
    const type = normalizeImportText(cells[indexes.type] || "");
    const transactionDate = parseTransactionDate(cells[indexes.transactiondate] || "");
    const amountMinor = parseMinorAmount(cells[indexes.amount] || "");
    const account = resolveUniqueReference({
      lookup: accountLookup,
      rawValue: cells[indexes.account],
      rowNumber,
      fieldLabel: "Account",
      errors
    });
    const categoryValue = cleanImportText(cells[indexes.category] || "");
    const toAccountValue = cleanImportText(cells[indexes.toaccount] || "");
    const savingGoalValue = cleanImportText(cells[indexes.savinggoal] || "");
    const feeMinor = parseMinorAmount(cells[indexes.feeamount] || "");
    const note = readDescription({ indexes, cells }, indexes.note, delimiter);

    if (!TRANSACTION_IMPORT_TYPES.includes(type)) {
      errors.push(`Row ${rowNumber}: Type must be exactly income, outcome, or transfer.`);
    }
    if (!transactionDate) {
      errors.push(`Row ${rowNumber}: Transaction Date must use YYYY-MM-DD.`);
    }
    if (!amountMinor) {
      errors.push(`Row ${rowNumber}: Amount is required and must be greater than zero.`);
    }
    if (account && context.authUserId && account.primaryOwnerUserId !== context.authUserId) {
      errors.push(`Row ${rowNumber}: Account must belong to the signed-in user.`);
    }

    let category = null;
    let toAccount = null;
    let savingGoal = null;

    if (type === "income" || type === "outcome") {
      category = resolveUniqueReference({
        lookup: categoryLookup,
        rawValue: categoryValue,
        rowNumber,
        fieldLabel: "Category",
        errors
      });
      if (toAccountValue || savingGoalValue) {
        errors.push(`Row ${rowNumber}: To Account and Saving Goal must be blank for income/outcome rows.`);
      }
      if (category && !isCategoryAllowedForType(category, type)) {
        errors.push(`Row ${rowNumber}: Category direction does not match ${type}.`);
      }
      if (type === "income" && feeMinor) {
        errors.push(`Row ${rowNumber}: Fee Amount is only allowed for outcome or transfer rows.`);
      }
    }

    if (type === "transfer") {
      if (categoryValue) {
        errors.push(`Row ${rowNumber}: Category must be blank for transfer rows.`);
      }
      if (!toAccountValue && !savingGoalValue) {
        errors.push(`Row ${rowNumber}: Transfer rows require To Account or Saving Goal.`);
      }
      if (toAccountValue && savingGoalValue) {
        errors.push(`Row ${rowNumber}: Use either To Account or Saving Goal, not both.`);
      }
      if (toAccountValue) {
        toAccount = resolveUniqueReference({
          lookup: accountLookup,
          rawValue: toAccountValue,
          rowNumber,
          fieldLabel: "To Account",
          errors
        });
        if (account && toAccount?.id === account.id) {
          errors.push(`Row ${rowNumber}: Transfer source and destination must be different unless reserving to a saving goal.`);
        }
      }
      if (savingGoalValue) {
        savingGoal = resolveUniqueReference({
          lookup: savingLookup,
          rawValue: savingGoalValue,
          rowNumber,
          fieldLabel: "Saving Goal",
          errors
        });
        toAccount = activeAccounts.find(item => item.id === savingGoal?.linkedAccountId) || null;
        if (savingGoal && !toAccount) {
          errors.push(`Row ${rowNumber}: Saving Goal is not linked to an active account.`);
        }
      }
    }

    if (!account) {
      return;
    }

    rows.push({
      rowNumber,
      transactionDate,
      type,
      amountMinor,
      feeMinor,
      accountId: account.id,
      accountName: account.name || "",
      categoryId: category?.id || null,
      categoryName: category?.name || "",
      toAccountId: toAccount?.id || null,
      toAccountName: toAccount?.name || "",
      savingGoalId: savingGoal?.id || null,
      savingGoalName: savingGoal?.name || "",
      note
    });
  });

  return {
    rows: errors.length ? [] : rows,
    errors
  };
}
