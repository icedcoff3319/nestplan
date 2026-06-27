# Spec: Firestore Rules And Data Contracts

Status: Planned

## Goal

- Keep Firestore rules aligned with the app's actual data shapes and permission model.
- Make rules changes safer by documenting expected collections, ownership boundaries, and write validation before implementation.

## Non-goals

- No broad schema rewrite just for cleanup.
- No hard-delete of audit-sensitive financial history.
- No weakening of client behavior to make rules easier.

## User Flow

- Normal users use household data through the app.
- Household admins manage household membership and shared setup.
- Master admins manage platform-level registration and library settings.
- Rules reject writes that do not match those roles, even if a client is modified.

## Data Model / Affected Collections

- Platform: `masterAdmins`, `registrationCodes`, `emailPolicyOverrides`, `emailPolicyBlockedDomains`, `appDefaultCategories`, `appGreetingQuotes`, `platformSettings`.
- User: `users/{uid}`.
- Household: `households/{householdId}`, `members`, `accounts`, `categories`, `transactions`, `budgets`, `savingGoals`, `savingGoalEvents`, `recurringBills`, `recurringBillOccurrences`, `investmentAccounts`, `investmentAssets`, `investmentEvents`, `inviteCodes`.

## Security And Permissions

- Authenticated and verified users may create/complete their own registered profile only through a valid registration code.
- Household members may read active household data.
- Account owners control their own accounts and transactions; household view does not grant spending access to another member's account.
- Household admins can manage membership and household-level settings.
- Master admins can manage platform-level invite-only registration and libraries.

## Validation Rules

- Transaction writes must validate type, posting kind, amount, ownership, account/category references, status, created metadata, and soft-delete paths.
- Account ownership must not be changed after creation except through an explicitly designed migration.
- System category keys and required directions must stay stable.
- Import/export changes must not bypass transaction validation.
- Data cleanup must be report-first and avoid hard-delete of financial history unless a spec explicitly approves it.

## Edge Cases

- Removed members with historical transactions.
- Archived accounts/categories referenced by old transactions.
- Same-account saving reserve transfer.
- Investment deposit/withdrawal categories.
- Email verification link failures caused by API key referrer restrictions.

## Tests

- Emulator rules tests for create/update/delete boundaries.
- Staging manual tests for admin, household admin, normal member, removed member, and cross-user account access.
- Production smoke only after staging passes and rules deploy is explicitly approved.

## Rollback Notes

- Rules releases require matching Git tag and rollback notes.
- If rules block production writes unexpectedly, redeploy the previous tagged rules immediately.
- If client and rules both change, promote them as a coordinated release.

## Open Questions

- Which existing rules should get dedicated emulator tests first?
- Should future import runs get their own collection and rules?
- Which archived records should remain readable forever for ledger/audit views?
