# NestPlan Testing Guide

Use this file as the shared testing memory for staging and production release checks. Do not store passwords, private invite codes, Firebase tokens, or personal financial data here.

## Environments

- Local app: `http://localhost:8080`
- Staging app: `https://nestplan-staging-863e5.web.app`
- Production app: `https://nestplan-863e5.web.app`
- Current staging build under review: update this before each staging review, latest promoted build `20260615c`
- Staging Firebase project: `nestplan-staging-863e5`
- Production Firebase project: `nestplan-863e5`

## Test Accounts

Passwords are intentionally not stored in the repository.

| Label | Email | Environment | Intended Use | Current Notes |
| --- | --- | --- | --- | --- |
| Test Account 1 | `tixemo5172@fixscal.com` | Staging | Primary personal user and household admin checks | Verified in staging on 2026-06-05; has a user profile and one household. |
| Test Account 2 | `lilid31565@fanchatu.com` | Staging | Second household/member collaboration checks | Verified in staging on 2026-06-05; has a user profile and one household. |
| Test Account 3 | `rijilev597@herojp.com` | Staging | Extra member/cross-user regression checks | Verified in staging on 2026-06-06; has a user profile and one household. |

## Signup And Verification Notes

- Registration is invite-only through a master-admin user creation code.
- A user creation code should be used once for one successful account creation.
- After signup, the user must verify the email before NestPlan creates or joins a household.
- If restricted Firebase web API keys are used, the project key must allow both the app Hosting domain and Firebase Auth action domain. For staging, that means `https://nestplan-staging-863e5.web.app/*` and `https://nestplan-staging-863e5.firebaseapp.com/*`.
- Best practice: keep the original NestPlan signup tab open, click the email verification link, then return to the original tab and choose `I verified my email`.
- If the verification link opens a new tab, that tab should not be used to create a household directly unless the app has successfully finalized the registration.
- If the original tab was closed, log in again with the same email and password, then complete the registration recovery flow.

## Staging Smoke Test

Run this before promoting staging to production.

- Open staging with the expected build marker, for example `https://nestplan-staging-863e5.web.app/?v=20260615c`.
- Reload while signed in and confirm the app shows the loading screen before the correct destination screen.
- Confirm existing users do not briefly land on login, onboarding, or setup screens.
- Log in with Test Account 1.
- Log in with Test Account 2 in another browser/session.
- Confirm each user can see only their own `My view` data.
- Confirm `Household` view shows shared household data for household members.
- Confirm another member cannot create a transaction from an account they do not own.
- Confirm same-account saving reserve transfer works for the linked account owner.
- Confirm spending from an account cannot consume locked saving balance.
- Confirm transfer with an empty note to a saving tied to the same account uses the saving name as the note.
- Confirm normal transfer with an empty note remains unchanged.
- Confirm account fee transactions still create the separate `Admin Fee` row when enabled.
- Confirm the Dashboard transaction Category `i` guide shows one flat category list.
- Confirm category CSV upload accepts valid rows with `income`, `outcome`, and `both`.
- Confirm category CSV upload rejects invalid `Direction` values before writing partial categories.
- Confirm category CSV upload skips duplicate active categories with the same name and direction.
- Confirm CSV download works from Dashboard ledger and Insights ledger.
- Confirm production is untouched during staging tests.

## Admin Smoke Test

- Open staging admin with `https://nestplan-staging-863e5.web.app/?v=20260615c&admin=1`.
- Log in with the staging master admin.
- Create a user creation code for a staging-only email.
- Confirm repeated clicks do not create accidental duplicate codes while loading.
- Revoke an unused code.
- Confirm maintenance mode can be enabled and disabled in staging.
- Confirm default category library behavior matches the current release plan.
- Confirm greeting and blocked-domain library behavior matches the current release plan.

## Default Category Starter Import

The app reads default categories from Firestore collection `appDefaultCategories`. The starter list is not part of runtime app behavior.

Use this controlled import tool only when the admin-managed Firestore library should receive the starter categories:

```powershell
$env:NESTPLAN_ADMIN_EMAIL="master-admin@example.com"
$env:NESTPLAN_ADMIN_PASSWORD="do-not-commit-passwords"
npm.cmd run seed:default-categories -- --project=staging
npm.cmd run seed:default-categories -- --project=staging --apply
```

Production uses the same command with `--project=production`, but only after staging output is reviewed. The importer adds missing starter categories only. It does not delete, overwrite, or reorder existing admin-managed categories.

## Production Promotion Test

Run only after staging passes.

- Confirm `git status --short --branch` is clean.
- Confirm the release branch and build marker are the intended ones.
- Run `node --check app.js`.
- Run `git diff --check`.
- Run `npm.cmd run test:rules`.
- Confirm whether Firestore rules changed.
- If rules changed, deploy rules to production only after explicit approval.
- Deploy Hosting to production only after explicit approval.
- Verify production serves the expected build marker.
- Confirm at least one existing production user can log in and load their dashboard.

## Category CSV Upload

CSV upload is available in `Planning -> Accounts & Categories -> Categories`.

Required columns:

| Direction | Category Name | Description |
| --- | --- | --- |
| `outcome` | `Essentials - Food` | `Meals, takeout, cafes, and eating out.` |
| `income` | `Work - Salary` | `Regular salary or wage income.` |
| `both` | `Shared - Reimbursement` | `Money paid or received back for shared costs.` |

Rules to test:

- `Direction` must be exactly lowercase `income`, `outcome`, or `both`.
- The import creates household categories only, not default-library categories.
- The import skips active duplicates with the same category name and direction.
- The import respects the 50 active manual category limit.
- Invalid rows should stop the import before any category is written.

Future improvement:

- Add a category CSV template download beside upload.
- Add transaction CSV upload with its own template download and all-or-nothing validation.

## Known Testing Rules

- Never commit passwords, API service account keys, private invite codes, or user financial screenshots.
- Prefer staging for behavior changes.
- Prefer emulator tests for security boundary checks that are hard to reproduce manually.
- Use production only for final smoke checks after staging has passed.
- If a staging test requires temporary email inboxes, record the email address here but keep the inbox link and password outside the repository.
