import test from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_ROW_ROLES,
  classifyReportRow,
  summarizeMoneyFlow
} from "../report-utils.js";

const categoryKeys = {
  investmentDeposit: "investment_deposit",
  investmentWithdrawal: "investment_withdrawal"
};

test("classifies real spending and excludes balance corrections", () => {
  assert.equal(classifyReportRow({ postingKind: "outcome", displayKind: "outcome" }), REPORT_ROW_ROLES.SPENDING);
  assert.equal(classifyReportRow({ postingKind: "adjustment_increase", displayKind: "adjustment" }), REPORT_ROW_ROLES.IGNORED);
});

test("separates savings and investment movements from spending", () => {
  assert.equal(classifyReportRow({
    displayKind: "transfer",
    postingKind: "transfer_in",
    savingGoalId: "saving-1"
  }), REPORT_ROW_ROLES.SAVING_ALLOCATION);
  assert.equal(classifyReportRow({ postingKind: "outcome" }, "investment_deposit"), REPORT_ROW_ROLES.INVESTMENT_ALLOCATION);
  assert.equal(classifyReportRow({ postingKind: "income" }, "investment_withdrawal"), REPORT_ROW_ROLES.INVESTMENT_WITHDRAWAL);
});

test("summarizes cash flow with median and average monthly spending", () => {
  const rows = [
    { month: "2026-04", postingKind: "income", amountMinor: 1000 },
    { month: "2026-04", postingKind: "outcome", amountMinor: 200 },
    { month: "2026-04", displayKind: "transfer", postingKind: "transfer_in", savingGoalId: "saving-1", amountMinor: 100 },
    { month: "2026-05", postingKind: "income", amountMinor: 1200 },
    { month: "2026-05", postingKind: "outcome", amountMinor: 400 },
    { month: "2026-05", postingKind: "outcome", categoryId: "investmentDeposit", amountMinor: 300 },
    { month: "2026-06", postingKind: "outcome", amountMinor: 3000 },
    { month: "2026-06", postingKind: "adjustment_increase", displayKind: "adjustment", amountMinor: 9000 }
  ];
  const summary = summarizeMoneyFlow(rows, ["2026-04", "2026-05", "2026-06"], {
    getCategorySystemKey: categoryId => categoryKeys[categoryId] || "",
    getMonthKey: row => row.month
  });

  assert.equal(summary.incomeMinor, 2200);
  assert.equal(summary.spendingMinor, 3600);
  assert.equal(summary.cashFlowMinor, -1400);
  assert.equal(summary.savingAllocationMinor, 100);
  assert.equal(summary.investmentAllocationMinor, 300);
  assert.equal(summary.medianMonthlySpendingMinor, 400);
  assert.equal(summary.averageMonthlySpendingMinor, 1200);
});
