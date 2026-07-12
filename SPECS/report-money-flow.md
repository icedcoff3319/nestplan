# Spec: Report Money Flow

Status: Implemented in staging

## Goal

- Make Report answer whether cash flow is healthy and whether spending is typical, while preserving detailed category and budget analysis.

## Non-goals

- Business accounting, accrual P&L, tax reporting, forecasting, or a financial-health score.
- Firestore schema, rules, or transaction-write changes.

## User Flow

- Choose My view or Household view and a time range.
- Read Income, Real spending, Cash surplus/deficit, median and average monthly spending, and saving/investment allocation.
- Use detail filters for category analysis without changing the top money-flow summary except for account/member filters.

## Data Model / Affected Collections

- Read-only use of existing household transactions, categories, savings, investments, accounts, and members.
- No new fields or documents.

## Security And Permissions

- Report uses the same visible transaction set as the current scope. No new reads or writes.

## Validation Rules

- Real spending includes outcome rows, including purchases paid from savings.
- Balance corrections, transfers, and investment deposits are not spending.
- Income excludes investment withdrawals. Savings funding and investment deposits are shown as allocation.
- Cash surplus/deficit equals income minus real spending.
- Median and average use calendar-month totals in the selected range.

## Edge Cases

- Empty months count as zero in median and average calculations.
- A one-month range cannot provide a meaningful typical-month comparison.
- Partial current/custom months are included as displayed and explained in the helper text.

## Tests

- Unit-test row classification, cash flow, allocations, median, average, and balance-correction exclusion.
- Staging-test date ranges, My/Household scope, detail filters, savings spending, saving funding, and investment movements.

## Rollback Notes

- Hosting rollback restores the previous Report UI; no data or rules rollback is required.

## Open Questions

- Revisit forecasting only after at least six months of reliable transaction history.
