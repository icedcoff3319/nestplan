# NestPlan Cleanup Plan

This cleanup track is intentionally separate from feature work. The goal is to make NestPlan easier to change safely without changing product behavior unless a cleanup step explicitly says so.

## Principles

- Use staging first for every cleanup milestone.
- Keep production on a known Git tag until staging is accepted.
- Prefer small commits that can be reviewed and rolled back independently.
- Do not mix behavior changes with broad refactors.
- Do not hard-delete financial history during cleanup.

## Current Cleanup Focus

Status: active.

The current cleanup track is documentation-first. The goal is to keep the codebase understandable before moving more logic out of `app.js`.

- Keep the runtime behavior unchanged.
- Keep production stable while cleanup happens on a branch first.
- Update the app map and extraction order before moving any high-dependency code.
- Prefer pure-helper extraction and tests before touching auth, listeners, transactions, or rules.

## Phase 1: Documentation And Build Hygiene

Status: active, healthy.

- Keep `DECISIONS.md` current so product and security choices survive chat context limits.
- Keep `TESTING.md` current with the latest staging smoke tests.
- Keep `RELEASE_CHECKLIST.md` current with the exact staging-to-production flow.
- Keep `CODE_STRUCTURE.md` current before extracting code.
- Keep Firebase Hosting lean by excluding docs, tests, scripts, logs, dependencies, packages, and local tooling.

Success criteria:

- A new contributor can understand where runtime code lives.
- A release can be promoted without guessing which commands to run.
- Product decisions are documented before implementation details are forgotten.
- Hosting deploys only the app runtime files and required public assets.

## Phase 1B: Boot And Loading

Status: completed for the current production flow.

- Dedicated loading screen is visible before Firebase Auth resolves.
- Auth, setup, and app screens stay hidden until the correct destination is known.
- Initial Firestore listener bursts should not briefly render onboarding with partial household data.
- Loading text and styling should remain isolated so it can be edited without touching auth logic.

## Phase 2: Release Hygiene

Status: active, healthy.

- Keep production and staging Firebase aliases in `.firebaserc`.
- Use versioned asset markers for every deploy.
- Use `RELEASE_CHECKLIST.md` before staging and production deploys.
- Run `npm.cmd run check:release` before staging and production deploys.
- Restrict Firebase web API keys in Google Cloud Console by allowed websites and APIs.

Success criteria:

- `.firebaserc` keeps `production` and `staging` pointed at the intended Firebase projects.
- Build markers match across `index.html`, `app.js`, and cache-busted imports.
- Firebase Hosting excludes non-runtime files from deploys.
- Firebase environment routing still sends staging hosts to staging and production hosts to production.
- API key restrictions are reviewed manually in Google Cloud Console.

## Phase 3: Code Structure Documentation

Status: active.

- Keep `CODE_STRUCTURE.md` current.
- Document major app areas before moving code.
- Add notes when a function is intentionally left in `app.js` because it is shared by several modules.

Success criteria:

- `app.js` has a current working map with major line ranges and ownership notes.
- Safe first extraction candidates are listed before code is moved.
- Fragile areas are explicitly called out so cleanup does not accidentally destabilize auth, listeners, or transaction writes.

## Phase 4: Low-Risk Module Split

Status: active.

Split `app.js` gradually while preserving behavior:

- Move pure category CSV import helpers first. Completed in `category-import.js`.
- Move pure CSV export helpers. Completed in `csv-export.js`.
- Move pure formatting helpers. Completed in `format-utils.js`.
- Move pure ledger history display helpers. Completed in `ledger-display.js`.
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
