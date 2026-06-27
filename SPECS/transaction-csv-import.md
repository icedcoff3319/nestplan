# Spec: Transaction CSV Import

Status: Planned

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
- What row limit should v1 enforce?
- Should users match accounts/categories by ID, name, or both?
