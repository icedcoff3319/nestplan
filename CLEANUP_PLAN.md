# NestPlan Cleanup Plan

This cleanup track is intentionally separate from feature work. The goal is to make NestPlan easier to change safely without changing product behavior unless a cleanup step explicitly says so.

## Principles

- Use staging first for every cleanup milestone.
- Keep production on a known Git tag until staging is accepted.
- Prefer small commits that can be reviewed and rolled back independently.
- Do not mix behavior changes with broad refactors.
- Do not hard-delete financial history during cleanup.

## Phase 1: Boot And Loading

Status: in progress on `codex/staging-cleanup-v1`.

- Add a dedicated loading screen that is visible before Firebase Auth resolves.
- Keep auth, setup, and app screens hidden until the correct destination is known.
- Prevent initial Firestore listener bursts from briefly rendering onboarding with partial household data.
- Keep loading text and styling isolated so it can be edited without touching auth logic.

Success criteria:

- Reloading as a signed-in user shows loading first, then the correct dashboard.
- The login screen does not flash for signed-in users.
- The setup/onboarding requirement does not flash for users who already have accounts and categories.

## Phase 2: Release Hygiene

- Keep production and staging Firebase aliases in `.firebaserc`.
- Use versioned asset markers for every deploy.
- Use `RELEASE_CHECKLIST.md` before staging and production deploys.
- Restrict Firebase web API keys in Google Cloud Console by allowed websites and APIs.

## Phase 3: Code Structure Documentation

- Keep `CODE_STRUCTURE.md` current.
- Document major app areas before moving code.
- Add notes when a function is intentionally left in `app.js` because it is shared by several modules.

## Phase 4: Low-Risk Module Split

Split `app.js` gradually while preserving behavior:

- Move pure formatting helpers first.
- Move CSV export logic.
- Move validation helpers.
- Move auth/session boot.
- Move household listeners.
- Move feature-specific render/write logic after the lower-risk helpers are stable.

Each split should pass syntax checks and staging smoke tests before the next split.

## Phase 5: Rules Cleanup

- Group Firestore rules by data domain.
- Extract repeated validation helpers only when behavior remains equivalent.
- Deploy rules to staging first.
- Promote rules to production only after explicit approval.

## Phase 6: Data Cleanup

Production data cleanup must be report-first.

Safe review candidates:

- Expired registration codes.
- Revoked invite codes.
- Duplicate greeting records.
- Clearly test-only admin policy records.

Do not hard-delete:

- Transactions.
- Saving events.
- Investment events.
- Bill occurrences.
- Household member history.

## Phase 7: UI/CSS Cleanup

- Group CSS by app area.
- Standardize compact cards, tables, buttons, modals, and info buttons.
- Remove unused selectors only after checking staging.
