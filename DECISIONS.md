# NestPlan Decisions

This file records product and engineering decisions that should survive chat context limits. Keep entries short, practical, and current.

## Environment Strategy

- Production Firebase project: `nestplan-863e5`.
- Staging Firebase project: `nestplan-staging-863e5`.
- Staging is the default place for feature work, cleanup, and risky tests.
- Production receives only staging-tested releases with explicit approval.
- Hosting-only releases should not deploy Firestore rules.
- Firestore rules releases require separate staging validation before production.

## Release And Rollback

- Every production release should have a build marker and Git tag.
- Hosting rollback can be done from Firebase Console for static-app regressions.
- Git tags let us redeploy an exact previous app version.
- If Firestore rules change, the matching rules from the same tag must be part of rollback planning.

## Invite-Only Registration

- Public signup is intentionally gated by master-admin user creation codes.
- One user creation code is intended for one successful account creation.
- Email verification is required before household creation or household join.
- Master-admin features belong on the admin route, not inside normal household settings.
- Admin route access is strict: logged-out users may see admin login, master admins may use admin tools, signed-in non-admins return to the normal app, and rules/network authorization errors stay visible for diagnosis.

## Household And Ownership Model

- Accounts are owned by the signed-in user who creates them.
- Admins can manage household membership and household-level setup, but normal spending should not use another member's owned account.
- Household view is shared context; My view is personal context.
- Household-scoped budgets, savings, bills, and investments are shared with household members.

## Categories

- Household categories are user-managed data under each household.
- The default category library is admin-managed Firestore data in `appDefaultCategories`.
- The default category library is not hardcoded runtime behavior.
- CSV category upload is for importing categories into the current household.
- CSV category import accepts `income`, `outcome`, and `both` directions.
- Existing active categories with the same name and direction should be skipped rather than duplicated.

## System Categories

- System categories currently support app automation:
  - `Admin Fee`
  - `Investment - Deposit`
  - `Investment - Withdrawal`
- These are protected in normal household category management because app flows depend on their system keys and directions.
- If we later allow master-admin customization, keep `systemKey` and required direction locked while allowing safe display-name/description changes.

## Data History

- Financial history should not be hard-deleted during normal cleanup.
- Transactions, saving events, investment events, bill occurrences, and member history are audit-sensitive.
- Prefer archive/soft-delete for user-facing removal unless a feature explicitly defines safe hard-delete behavior.

## Clean Build Rules

- The runtime app is intentionally static and buildless: `index.html`, `app.js`, `styles.css`, `constants.js`, and `firebase-client.js`.
- Firebase Hosting ignores docs, tests, scripts, logs, package files, dependencies, Git metadata, and local tooling.
- Keep behavior changes narrow before production.
- Do not mix large refactors with feature releases.
- Cleanup should first improve documentation, tests, and pure helpers before touching Firebase listener/write flows.
