# Spec: Transaction CSV Import

Status: In progress

## Goal

- Let users import multiple ledger transactions from a CSV file.
- Provide a downloadable template so users do not need to guess the format.
- Validate the full file before writing anything, so bad files do not create partial ledger history.

## Non-goals

- No bank-statement auto-detection in this pass.
- No OCR, PDF parsing, broker sync, or investment-lot tracking.
- No hard-delete or rewrite of existing historical transactions.

## User Flow

- User opens the import tool from the ledger/transaction area.
- User downloads a CSV template.
- User fills the template and uploads it.
- App shows a preview with row count, total impact, warnings, and blocking errors.
- User confirms import.
- App writes all valid rows in one controlled batch or writes nothing.

V1 template columns:

| Transaction Date | Type | Amount | Account | Category | To Account | Saving Goal | Note | Fee Amount |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-04-22` | `outcome` | `45000` | `BCA` | `Essentials - Food` |  |  | `Lunch` | `2500` |
| `2026-04-23` | `income` | `5000000` | `BCA` | `Work - Salary` |  |  | `Salary` |  |
| `2026-04-24` | `transfer` | `300000` | `BCA` |  | `GoPay` |  | `Top up e-wallet` | `1000` |
| `2026-04-25` | `transfer` | `100000` | `BCA` |  |  | `Emergency Fund` | `Reserve to saving` |  |

V1 field rules:

- `Transaction Date` uses `YYYY-MM-DD`.
- `Type` is exactly `income`, `outcome`, or `transfer`.
- `Amount` and `Fee Amount` are IDR minor-unit integers or formatted IDR digits such as `45.000`.
- `Account`, `Category`, `To Account`, and `Saving Goal` may match by unique name or ID.
- `Saving Goal` is used only for transfer rows that reserve/fund a saving goal.

## Data Model / Affected Collections

- Writes to `households/{householdId}/transactions`.
- Reads current household `accounts`, `categories`, `savingGoals`, `investmentAccounts`, `recurringBills`, and existing `transactions` for validation context.
- Optional later: `households/{householdId}/importRuns/{importRunId}` for audit and duplicate detection.

## Security And Permissions

- Import must obey the same permissions as manual transaction creation.
- A user cannot import spending from another member's owned account.
- Household view does not bypass account ownership rules.
- Firestore rules must reject invalid transaction shapes even if the client preview is bypassed.

## Validation Rules

- Required template fields must include transaction date, type/direction, amount, account, and category or route where applicable.
- Amount must be positive and parsed to minor units.
- Dates must be valid and backdating must preserve created timestamp separately.
- Category direction must match transaction type.
- Transfer rows require source and destination; source and destination cannot be identical except approved saving-reserve behavior.
- Fees create separate `Admin Fee` outcome rows when requested.
- Import must prevent negative account balance and locked-saving violations.
- Invalid rows block the whole import before any write.

V1 parser foundation:

- Parse and validate CSV structure, references, ownership, category direction, and transfer/saving target shape.
- Provide a preview-only UI in Insights > Ledger with template download, blocking errors, row count, totals, and normalized row preview.
- Do not write to Firestore yet.
- Do not yet simulate balances.
- Do not yet support balance correction, recurring bill completion, or investment-specific transaction import.

## Edge Cases

- Duplicate CSV rows should be detected or clearly warned.
- Archived accounts/categories should not be accepted as new transaction targets.
- Empty note should follow current transaction fallback behavior.
- Very large files should have a practical row limit before upload preview.

## Tests

- Unit tests for CSV parsing, row normalization, and validation errors.
- Rules tests for rejected invalid transaction shapes.
- Staging manual test with valid file, invalid file, duplicate rows, fee rows, transfer rows, and saving-reserve rows.
- Production smoke: import a tiny staging-approved sample only after explicit approval.

## Rollback Notes

- Hosting rollback removes the UI.
- If imported transactions were written incorrectly, treat them as ledger history and use soft-delete/reversal policy, not hard-delete by default.
- If rules change, tag and keep matching rule rollback plan.

## Open Questions

- Should we add `importRuns` in v1 or wait until duplicate detection needs it?
- Current parser foundation uses a 250-row limit. Confirm whether the UI should keep that limit.
- Current parser foundation allows matching accounts/categories/savings by unique name or ID. Confirm whether the UI should expose IDs in the template later.
