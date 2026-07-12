export const REPORT_ROW_ROLES = Object.freeze({
  INCOME: "income",
  SPENDING: "spending",
  SAVING_ALLOCATION: "saving-allocation",
  INVESTMENT_ALLOCATION: "investment-allocation",
  INVESTMENT_WITHDRAWAL: "investment-withdrawal",
  IGNORED: "ignored"
});

export function classifyReportRow(row, categorySystemKey = "") {
  if (!row || row.status === "deleted" || row.displayKind === "adjustment" || String(row.postingKind || "").startsWith("adjustment_")) {
    return REPORT_ROW_ROLES.IGNORED;
  }
  if (row.displayKind === "transfer" && row.postingKind === "transfer_in" && row.savingGoalId) {
    return REPORT_ROW_ROLES.SAVING_ALLOCATION;
  }
  if (categorySystemKey === "investment_deposit") {
    return REPORT_ROW_ROLES.INVESTMENT_ALLOCATION;
  }
  if (categorySystemKey === "investment_withdrawal") {
    return REPORT_ROW_ROLES.INVESTMENT_WITHDRAWAL;
  }
  if (row.postingKind === "income") {
    return REPORT_ROW_ROLES.INCOME;
  }
  if (row.postingKind === "outcome") {
    return REPORT_ROW_ROLES.SPENDING;
  }
  return REPORT_ROW_ROLES.IGNORED;
}

export function summarizeMoneyFlow(rows, monthKeys, { getCategorySystemKey, getMonthKey }) {
  const monthly = new Map(monthKeys.map(monthKey => [monthKey, createMonthSummary(monthKey)]));
  const totals = createMonthSummary("");

  rows.forEach(row => {
    const monthKey = getMonthKey(row);
    const month = monthly.get(monthKey);
    if (!month) {
      return;
    }
    const role = classifyReportRow(row, getCategorySystemKey(row.categoryId || ""));
    const amountMinor = Number(row.amountMinor || 0);
    addRoleAmount(month, role, amountMinor);
    addRoleAmount(totals, role, amountMinor);
  });

  const monthlyRows = [...monthly.values()].map(finalizeMonthSummary);
  const spendingValues = monthlyRows.map(row => row.spendingMinor);
  return {
    ...finalizeMonthSummary(totals),
    monthlyRows,
    medianMonthlySpendingMinor: median(spendingValues),
    averageMonthlySpendingMinor: spendingValues.length
      ? Math.round(spendingValues.reduce((sum, value) => sum + value, 0) / spendingValues.length)
      : 0
  };
}

function createMonthSummary(monthKey) {
  return {
    monthKey,
    incomeMinor: 0,
    spendingMinor: 0,
    savingAllocationMinor: 0,
    investmentAllocationMinor: 0
  };
}

function addRoleAmount(summary, role, amountMinor) {
  if (role === REPORT_ROW_ROLES.INCOME) {
    summary.incomeMinor += amountMinor;
  } else if (role === REPORT_ROW_ROLES.SPENDING) {
    summary.spendingMinor += amountMinor;
  } else if (role === REPORT_ROW_ROLES.SAVING_ALLOCATION) {
    summary.savingAllocationMinor += amountMinor;
  } else if (role === REPORT_ROW_ROLES.INVESTMENT_ALLOCATION) {
    summary.investmentAllocationMinor += amountMinor;
  }
}

function finalizeMonthSummary(summary) {
  return {
    ...summary,
    cashFlowMinor: summary.incomeMinor - summary.spendingMinor,
    allocationMinor: summary.savingAllocationMinor + summary.investmentAllocationMinor
  };
}

function median(values) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
