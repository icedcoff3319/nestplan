# NestPlan Code Structure

NestPlan is currently a local-first static web app backed by Firebase Auth and Firestore. The app is intentionally kept deployable without a build step, so the main runtime files are small in number but `app.js` is large.

## Runtime Files

- `index.html` contains the app shells, forms, cards, modals, and cache-busted script/style references.
- `styles.css` contains the visual system, responsive layout, cards, tables, modals, and mobile polish.
- `app.js` contains state, event binding, Firebase reads/writes, rendering, validation, export, and UI helpers.
- `category-import.js` contains pure household category CSV parsing helpers.
- `transaction-import.js` contains pure transaction CSV template, parsing, and pre-write validation helpers. The current preview-only UI is wired from `app.js`.
- `csv-export.js` contains pure ledger CSV export formatting and filename helpers.
- `format-utils.js` contains pure money, date, month, schedule, timestamp, and expiry formatting helpers.
- `ledger-display.js` contains pure ledger history title/subtitle display helpers.
- `text-utils.js` contains pure text cleanup, escaping, capitalization, email normalization, and domain normalization helpers.
- `access-utils.js` contains pure invite/user-code generation, access-code cleanup, registration expiry clamping, and admin access-policy serializers.
- `firebase-client.js` owns Firebase SDK imports, environment selection, and Firebase service exports.
- `constants.js` owns app constants, the minimal built-in greeting fallback, and system category seeds.
- `firestore.rules` owns the production/staging security contract.

## Non-Hosted Project Files

These files support development and release discipline but are excluded from Firebase Hosting by `firebase.json`:

- `scripts/**`
- `tests/**`
- `package.json`
- `package-lock.json`
- docs such as `SPECS/**`, `TESTING.md`, `RELEASE_CHECKLIST.md`, `CLEANUP_PLAN.md`, `CODE_STRUCTURE.md`, and `DECISIONS.md`
- logs, local tool folders, Git metadata, dependencies, and temporary files

## `app.js` Working Map

Approximate line ranges change over time, but the current order is:

- Lines 1-807: imports, constants, global `state`, DOM `els`, info modal copy, listener globals, and maintenance write guards.
- Lines 808-1178: event binding, money input binding, listener teardown, maintenance listener, render scheduling, ledger reset, and household context clearing.
- Lines 1179-1537: auth boot, user session loading, profile refresh, greeting/default library loading, email verification, pending registration, and verification-return handling.
- Lines 1538-1846: master-admin service helpers for admin status, dashboard data, maintenance mode, registration codes, email overrides, blocked domains, greeting quotes, and default category library.
- Lines 1847-2585: form/event handlers for login, signup, verification, master admin actions, household setup/join/switching, profile, household rename, invites, members, and admin-library tables.
- Lines 2586-3061: Planning handlers for budgets, savings, saving completion/reopen, recurring bills, bill reminders, and archive/delete behavior.
- Lines 3062-3577: Investment handlers for portfolio setup, activity, scope switching, movement transactions, asset updates, and archive/delete behavior.
- Lines 3578-3937: Account, balance correction, category creation, category CSV import, category edit/archive handlers.
- Lines 3938-4313: Transaction submit handlers, single/transfer transaction writers, dashboard investment transfers, fee rows, and permission-denied messaging.
- Lines 4314-4762: Ledger/history/export handlers for edit/delete menus, filters, layout selection, month navigation, CSV modal, download, and copy.
- Lines 4763-5499: user profile creation, household loading, real-time household listeners, household creation/join, invite acceptance/revocation, and active household updates.
- Lines 5500-7271: render pipeline and major render functions for boot screens, admin screen, setup, app shell, header, onboarding, dashboard, planning, insights, reports, performance, and investments.
- Lines 7272-8064: form population/reset helpers and domain calculations for planning, investments, savings, budgets, bill reminders, scope, category eligibility, and default category behavior.
- Lines 8065-8674: bill reminder writes, lookup helpers, category CSV/default helpers, category guide modal, general info modal, and report filter modal.
- Lines 8675-9647: dashboard ledger rendering, dedicated ledger filters/table rendering, transaction select synchronization, fee helpers, recurring bill completion sync, and ledger row action controls.
- Lines 9648-10066: ledger/account balance calculations, visibility filters, grouped ledger mapping, row builders, permissions, and transaction payload builders.
- Lines 10067-10567: form resets, screen/view/scope state setters, fatal errors, messages, maintenance guards, user-facing error mapping, auth route helpers, and busy/loading helpers.
- Lines 10568-end: money parsing, password toggle, registration/email policy Firestore checks, profile/household normalization, and generic HTML helpers.

Core landmarks:

- `state` is the single client-side data store.
- `els` maps DOM elements from `index.html`.
- `bindEvents()` is the central event binding point.
- `handleAuthStateChanged()` starts auth/session loading.
- `loadHouseholdContext()` owns active household real-time listeners.
- `renderApp()` coordinates the normal app render flow through `safeRenderStep()`.
- `handleTransactionSubmit()` is the main transaction write entry point.
- `renderTransactions()` and `renderPlanningLedger()` own the dashboard and dedicated ledger displays.
- `ensureSystemCategories()` protects app-required system categories.

## Admin-Managed Libraries

- Greeting quotes live in Firestore and can be managed by master admins.
- Blocked email domains live in Firestore and can be managed by master admins.
- Default categories live in Firestore collection `appDefaultCategories`.
- The default category seed script is a development/admin utility only and is not hosted as runtime app code.
- Household CSV category upload creates categories in the current household; it does not edit the admin default library.

## Safe Extraction Candidates

These are good first module-split candidates because they are mostly pure helpers or low-side-effect utilities:

- CSV category import parsing: moved to `category-import.js` in Phase 4.
- CSV export formatting: moved to `csv-export.js` in Phase 4.
- Money/date formatting: moved to `format-utils.js` in Phase 4.
- Ledger history title/subtitle display: moved to `ledger-display.js` in Phase 4.
- Text helpers: moved to `text-utils.js` in Phase 4.
- Report math helpers: median, variance, month-window helpers, report model builders after tests are added.
- Access code helpers: moved to `access-utils.js` in Phase 4.

Each extraction should include:

- no behavior change;
- one small module at a time;
- `node --check app.js`;
- `npm.cmd run check:release`;
- relevant manual staging smoke test if UI behavior is touched.

## Next Extraction Map

Use this order for the next cleanup passes. It keeps risk low while shrinking `app.js` gradually.

1. Code and policy normalization helpers. Completed in `access-utils.js`.
Firestore reads/writes remain in `app.js`; only generation, normalization, expiry clamping, and serializers were extracted.

2. Ledger calculation helpers.
Candidate functions: timestamp sorting, grouping, visibility checks, amount class/prefix logic, and table row display models.
Target module: `ledger-utils.js`.
Safety: add tests before moving anything that affects balances or personal-vs-household visibility.

3. Report math helpers.
Candidate functions: median, variance, month windows, trend helpers, and report model builders.
Target module: `report-utils.js`.
Safety: tests should cover month boundaries and empty data before extraction.

4. DOM render sections.
Candidate areas: admin-library tables, report filter modal, category guide modal, and compact dashboard snapshots.
Target modules: only after pure helpers are stable.
Safety: staging visual smoke tests are required because these touch the UI directly.

## Fragile Areas To Avoid First

Do not extract these until helper extraction and tests are stable:

- Auth boot and email-verification recovery.
- `loadHouseholdContext()` and real-time listener state updates.
- Transaction write flows, especially transfer, saving reserve, fee row, bill completion, and investment transfer behavior.
- Firestore rules and client writes together unless the change is explicitly rules-focused.
- Maintenance mode write guards.
- The main render pipeline around `renderApp()` and `safeRenderStep()`.

These areas are not bad code; they are simply high-dependency areas where small mistakes can produce login flicker, stale data, permission errors, or incorrect ledger balances.

## Change Guidelines

- Keep production and staging separated through Firebase project selection and Git branches.
- Prefer narrow patches over broad refactors before production releases.
- Add Firestore rules changes with matching client behavior and staging tests.
- Use maintenance mode before production releases that change rules or data behavior.
- Avoid rewriting historical ledger rows unless the product decision explicitly requires it.
- Preserve archived/deleted records where they are part of audit history.
- Keep the Firebase Hosting bundle lean by checking `firebase.json` ignores before production releases.
- Update this file before moving a major group of functions.
