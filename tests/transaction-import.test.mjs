import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTransactionImportTemplate,
  parseTransactionImportCsv,
  TRANSACTION_IMPORT_COLUMNS,
  TRANSACTION_IMPORT_ROW_LIMIT
} from "../transaction-import.js";

const authUserId = "user-a";
const accounts = [
  { id: "account-bca", name: "BCA", status: "active", primaryOwnerUserId: authUserId },
  { id: "account-gopay", name: "GoPay", status: "active", primaryOwnerUserId: authUserId },
  { id: "account-wife", name: "BCA Wife", status: "active", primaryOwnerUserId: "user-b" },
  { id: "account-archived", name: "Old Wallet", status: "archived", primaryOwnerUserId: authUserId }
];
const categories = [
  { id: "cat-food", name: "Essentials - Food", direction: "outcome", status: "active" },
  { id: "cat-salary", name: "Work - Salary", direction: "income", status: "active" },
  { id: "cat-shared", name: "Shared - Reimbursement", direction: "both", status: "active" },
  { id: "cat-old", name: "Old Category", direction: "outcome", status: "archived" }
];
const savingGoals = [
  { id: "saving-emergency", name: "Emergency Fund", linkedAccountId: "account-bca", status: "active" },
  { id: "saving-completed", name: "Completed Goal", linkedAccountId: "account-bca", status: "completed" }
];

function context(overrides = {}) {
  return {
    authUserId,
    accounts,
    categories,
    savingGoals,
    ...overrides
  };
}

test("buildTransactionImportTemplate includes the v1 columns and examples", () => {
  const template = buildTransactionImportTemplate();

  assert.equal(template.split("\n")[0], TRANSACTION_IMPORT_COLUMNS.join(","));
  assert.match(template, /outcome/);
  assert.match(template, /income/);
  assert.match(template, /transfer/);
  assert.match(template, /Emergency Fund/);
});

test("parseTransactionImportCsv accepts income, outcome, transfer, saving transfer, and fees", () => {
  const result = parseTransactionImportCsv(`Transaction Date,Type,Amount,Account,Category,To Account,Saving Goal,Note,Fee Amount
2026-04-22,outcome,45.000,BCA,Essentials - Food,,,Lunch,2.500
2026-04-23,income,5000000,BCA,Work - Salary,,,Salary,
2026-04-24,transfer,300000,BCA,,GoPay,,Top up e-wallet,1000
2026-04-25,transfer,100000,BCA,,,Emergency Fund,Reserve to saving,`, context());

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 4);
  assert.deepEqual(result.rows.map(row => row.type), ["outcome", "income", "transfer", "transfer"]);
  assert.equal(result.rows[0].amountMinor, 45000);
  assert.equal(result.rows[0].feeMinor, 2500);
  assert.equal(result.rows[0].categoryId, "cat-food");
  assert.equal(result.rows[2].toAccountId, "account-gopay");
  assert.equal(result.rows[3].savingGoalId, "saving-emergency");
  assert.equal(result.rows[3].toAccountId, "account-bca");
});

test("parseTransactionImportCsv accepts pipe-separated rows and quoted delimiters", () => {
  const result = parseTransactionImportCsv(`Transaction Date | Type | Amount | Account | Category | To Account | Saving Goal | Note | Fee Amount
2026-04-22 | outcome | 45000 | BCA | Essentials - Food | | | "Lunch | delivery" | `, context());

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].note, "Lunch | delivery");
});

test("parseTransactionImportCsv rejects missing headers", () => {
  const result = parseTransactionImportCsv(`Date,Type,Amount
2026-04-22,outcome,45000`, context());

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /Use this header exactly/);
});

test("parseTransactionImportCsv rejects invalid rows all-or-nothing", () => {
  const result = parseTransactionImportCsv(`Transaction Date,Type,Amount,Account,Category,To Account,Saving Goal,Note,Fee Amount
2026-04-22,outcome,45000,BCA,Essentials - Food,,,Lunch,
22-04-2026,outcome,,BCA,Work - Salary,,,Bad row,`, context());

  assert.equal(result.rows.length, 0);
  assert.match(result.errors.join("\n"), /Transaction Date must use YYYY-MM-DD/);
  assert.match(result.errors.join("\n"), /Amount is required/);
  assert.match(result.errors.join("\n"), /Category direction does not match outcome/);
});

test("parseTransactionImportCsv rejects source accounts not owned by signed-in user", () => {
  const result = parseTransactionImportCsv(`Transaction Date,Type,Amount,Account,Category,To Account,Saving Goal,Note,Fee Amount
2026-04-22,outcome,45000,BCA Wife,Essentials - Food,,,Lunch,`, context());

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /Account must belong to the signed-in user/);
});

test("parseTransactionImportCsv rejects ambiguous account/category names", () => {
  const result = parseTransactionImportCsv(`Transaction Date,Type,Amount,Account,Category,To Account,Saving Goal,Note,Fee Amount
2026-04-22,outcome,45000,BCA,Food,,,Lunch,`, context({
    accounts: [
      ...accounts,
      { id: "account-bca-2", name: "BCA", status: "active", primaryOwnerUserId: authUserId }
    ],
    categories: [
      ...categories,
      { id: "cat-food-2", name: "Food", direction: "outcome", status: "active" },
      { id: "cat-food-3", name: "Food", direction: "outcome", status: "active" }
    ]
  }));

  assert.equal(result.rows.length, 0);
  assert.match(result.errors.join("\n"), /Account "BCA" matches more than one item/);
  assert.match(result.errors.join("\n"), /Category "Food" matches more than one item/);
});

test("parseTransactionImportCsv rejects invalid transfer shapes", () => {
  const result = parseTransactionImportCsv(`Transaction Date,Type,Amount,Account,Category,To Account,Saving Goal,Note,Fee Amount
2026-04-22,transfer,45000,BCA,Essentials - Food,,,,
2026-04-23,transfer,45000,BCA,,BCA,,Same account,
2026-04-24,transfer,45000,BCA,,GoPay,Emergency Fund,Both targets,`, context());

  assert.equal(result.rows.length, 0);
  assert.match(result.errors.join("\n"), /Category must be blank for transfer rows/);
  assert.match(result.errors.join("\n"), /Transfer rows require To Account or Saving Goal/);
  assert.match(result.errors.join("\n"), /source and destination must be different/);
  assert.match(result.errors.join("\n"), /Use either To Account or Saving Goal/);
});

test("parseTransactionImportCsv rejects completed savings as funding targets", () => {
  const result = parseTransactionImportCsv(`Transaction Date,Type,Amount,Account,Category,To Account,Saving Goal,Note,Fee Amount
2026-04-22,transfer,45000,BCA,,,Completed Goal,Reserve,`, context());

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /Saving Goal "Completed Goal" was not found/);
});

test("parseTransactionImportCsv enforces the row limit", () => {
  const dataRows = Array.from({ length: TRANSACTION_IMPORT_ROW_LIMIT + 1 }, (_, index) => (
    `2026-04-${String((index % 20) + 1).padStart(2, "0")},outcome,45000,BCA,Essentials - Food,,,Lunch,`
  ));
  const result = parseTransactionImportCsv([
    TRANSACTION_IMPORT_COLUMNS.join(","),
    ...dataRows
  ].join("\n"), context());

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /limited to 250 rows/);
});
