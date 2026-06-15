# NestPlan Release Checklist

Use this checklist before staging and production deploys.

## Before Staging

- Confirm branch is not `main` for cleanup or feature work.
- Confirm `git status --short --branch` is expected.
- Bump the build marker in `index.html` and cache-busted imports.
- Run `node --check app.js`.
- Run `npm.cmd run check:release`.
- Run `git diff --check`.
- Review `git diff --stat`.
- Confirm `firebase.json` Hosting ignores still exclude docs, scripts, tests, logs, dependencies, package files, and Git metadata.
- Deploy to staging only.
- Verify the staging URL serves the new build marker.

## Staging Smoke Test

- Reload while signed in and confirm loading goes directly to the correct screen.
- Log out and confirm login appears only after auth resolution.
- Log in and confirm dashboard loads.
- Confirm onboarding does not flash for an already configured household.
- Create a simple transaction.
- Open Planning, Investments, and Insights.
- Check admin route if the change touches admin behavior.

## Before Production

- Confirm staging passed.
- Confirm the change scope is intentionally small, or split unrelated cleanup into a separate staging cycle.
- Confirm no unexpected Firestore project config, auth flow, or rules changes are included.
- Run `node --check app.js`.
- Run `npm.cmd run check:release`.
- Run `git diff --check`.
- Run `npm.cmd run test:rules`.
- Commit the branch.
- Merge or fast-forward to `main` only after approval.
- Tag the production release.
- Deploy Hosting to production.
- Deploy Firestore rules only if the release intentionally changes rules.
- Verify production URL serves the new build marker.
- Push `main` and tags to GitHub.

## Clean Build Check

- Runtime files should stay easy to identify: `index.html`, `app.js`, `styles.css`, `constants.js`, `firebase-client.js`.
- Do not ship local scripts, tests, logs, docs, dependencies, or temporary tooling through Hosting.
- Prefer one product change per release.
- Avoid mixing refactors with user-facing behavior changes.
- If a file grows because of a feature, add or update documentation before starting the next feature.

## Rollback

- Use Firebase Hosting rollback for Hosting-only regressions.
- Redeploy the previous Git tag if the local project must match the old release exactly.
- If rules changed, redeploy the matching previous rules from the previous Git tag.
