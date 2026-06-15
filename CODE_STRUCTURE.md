# NestPlan Code Structure

NestPlan is currently a local-first static web app backed by Firebase Auth and Firestore. The app is intentionally kept deployable without a build step, so the main runtime files are small in number but `app.js` is large.

## Runtime Files

- `index.html` contains the app shells, forms, cards, modals, and cache-busted script/style references.
- `styles.css` contains the visual system, responsive layout, cards, tables, modals, and mobile polish.
- `app.js` contains state, event binding, Firebase reads/writes, rendering, validation, export, and UI helpers.
- `firebase-client.js` owns Firebase SDK imports, environment selection, and Firebase service exports.
- `constants.js` owns app constants, the minimal built-in greeting fallback, and system category seeds.
- `firestore.rules` owns the production/staging security contract.

## Non-Hosted Project Files

These files support development and release discipline but are excluded from Firebase Hosting by `firebase.json`:

- `scripts/**`
- `tests/**`
- `package.json`
- `package-lock.json`
- docs such as `TESTING.md`, `RELEASE_CHECKLIST.md`, `CLEANUP_PLAN.md`, `CODE_STRUCTURE.md`, and `DECISIONS.md`
- logs, local tool folders, Git metadata, dependencies, and temporary files

## `app.js` Working Map

- Imports and constants are at the top.
- `state` is the single client-side state object.
- `els` maps DOM elements from `index.html`.
- Event binding is centralized in `bindEvents()`.
- Auth/session loading starts from `handleAuthStateChanged()`.
- Master admin helpers and handlers manage invite-only registration, policy libraries, and maintenance mode.
- Household context is loaded through real-time listeners in `loadHouseholdContext()`.
- Submit handlers validate and write user data.
- Render functions update visible UI from `state`.
- Utility helpers live near the bottom.

## Admin-Managed Libraries

- Greeting quotes live in Firestore and can be managed by master admins.
- Blocked email domains live in Firestore and can be managed by master admins.
- Default categories live in Firestore collection `appDefaultCategories`.
- The default category seed script is a development/admin utility only and is not hosted as runtime app code.
- Household CSV category upload creates categories in the current household; it does not edit the admin default library.

## Change Guidelines

- Keep production and staging separated through Firebase project selection and Git branches.
- Prefer narrow patches over broad refactors before production releases.
- Add Firestore rules changes with matching client behavior and staging tests.
- Use maintenance mode before production releases that change rules or data behavior.
- Avoid rewriting historical ledger rows unless the product decision explicitly requires it.
- Preserve archived/deleted records where they are part of audit history.
- Keep the Firebase Hosting bundle lean by checking `firebase.json` ignores before production releases.
