# NestPlan Firebase Setup

This repo now uses the multi-household NestPlan foundation. The app code is ready locally, but the Firebase project still needs a small console and deploy pass so the current code-only invite flow works cleanly.

## 1. Current verified status from localhost
- Verified locally on `http://localhost:8080/?v=20260423b`
- Password `Show` / `Hide` works on both `Log in` and `Sign up`
- Clean reload still boots correctly and keeps the auth screen stable
- `Sign up` with `Create household` reaches the app and onboarding without bouncing back to login
- Logging in from a second isolated browser session works
- Invite-code generation is still blocked by Firestore permissions until the latest rules are published
- The current local rules now also include a fix for reading `/users/{uid}` without applying the write validator to read operations
- Onboarding clears after creating the first account plus 1 income category and 1 outcome category
- Ledger ordering, created timestamps, balance-correction labeling, edit mode, and CSV export were validated from the local app
- Firebase Hosting is still intentionally out of scope for now

## 2. Confirm the project
- Project ID expected by this repo: `nestplan-863e5`
- Firebase config is already wired in [firebase-client.js](C:\Users\Akhdan\Documents\NestPlan\firebase-client.js)

## 3. Enable Authentication
- Open Firebase Console
- Go to `Authentication` -> `Sign-in method`
- Enable `Email/Password`

## 4. Enable Firestore
- Open `Firestore Database`
- Create the database if it does not exist
- Publish the rules from [firestore.rules](C:\Users\Akhdan\Documents\NestPlan\firestore.rules)

## 5. Fastest manual rules publish in Firebase Console
Use this path if you want the invite flow unblocked right now without installing any tooling.

1. Open Firebase Console for project `nestplan-863e5`
2. Open `Firestore Database`
3. Open the `Rules` tab
4. Open [firestore.rules](C:\Users\Akhdan\Documents\NestPlan\firestore.rules) on your computer
5. Copy the full file contents
6. Replace the current Firestore rules in the console with that full local file
7. Click `Publish`
8. Wait for the publish confirmation
9. Re-test from the local app:
   - sign up with `Create household`
   - generate invite code
   - sign up with `Join with invite code`

If invite-code generation still shows `Firebase denied this action...` after publishing, refresh the local app once and test again in a clean browser session.

## 6. CLI deploy path
Run these from `C:\Users\Akhdan\Documents\NestPlan` once Firebase CLI is available:

```bash
firebase login
firebase use nestplan-863e5
firebase deploy --only firestore:rules,firestore:indexes
```

Important:
- publish the latest [firestore.rules](C:\Users\Akhdan\Documents\NestPlan\firestore.rules) before testing invite generation or join-by-code
- if you still have the previous rules deployed, the app can show `Missing or insufficient permissions` when generating invite codes
- this machine was blocked from downloading Firebase CLI during the latest pass because the system drive had effectively no free space

## 7. Local-first validation order
Use this order before adding new product features:

1. Open the app locally at `http://localhost:8080`
2. Confirm the URL settles at `?v=20260423b`
3. Re-check password `Show` / `Hide` in both auth forms
4. Sign up with `Create household`
5. Log in with the same account from a second browser session
6. Publish the latest Firestore rules
7. Generate an invite code
8. Sign up a second account with `Join with invite code`
9. Create the first account, first income category, and first outcome category
10. Verify ledger history, edit mode, and CSV export

## 8. Current collections used by the app
- `users/{uid}`
- `households/{householdId}`
- `households/{householdId}/members/{uid}`
- `households/{householdId}/invites/{inviteId}`
- `households/{householdId}/accounts/{accountId}`
- `households/{householdId}/categories/{categoryId}`
- `households/{householdId}/transactions/{transactionId}`
- `inviteCodes/{inviteCode}`

## 9. Important behavior changes
- Each user can belong to up to 3 households.
- `activeHouseholdId` is now the main session household field on the user doc.
- Accounts must always have an owner.
- Invites are now code-only:
  - the app generates a 24-hour invite code
  - the code is stored under `households/.../invites` and `inviteCodes/...`
  - you share the code manually outside the app

## 10. Recommended clean-start note
- Legacy root collections such as `accounts`, `categories`, and `transactions` are not used by the current app anymore.
- The app can migrate a legacy `defaultHouseholdId` into the newer `householdIds` + `activeHouseholdId` shape on first login.
- If this is still a low-risk test environment, a clean reset is still the easiest path.

## 11. Manual test checklist
- Sign up with `Create household`
- Sign up with `Join with invite code`
- Log in and switch households
- Generate an invite code and join it with a second account
- Add the first account, first income category, and first outcome category to clear onboarding
- Create income, outcome, transfer, and balance correction entries
- Edit a ledger item
- Delete a ledger item
- Export CSV with both download and copy flows
- Toggle between `My view` and `Household`

## 12. What is intentionally deferred
- Budgets
- Saving goals
- Recurring bills
- AI receipt parsing
- Investment tracking
- Fine-grained per-account permissions inside a household
