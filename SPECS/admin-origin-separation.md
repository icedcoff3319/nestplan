# Spec: Admin Origin Separation

Status: Planned

## Goal

- Separate admin and normal-user browser sessions so one browser profile can safely use both without Firebase Auth session collisions.
- Keep admin tooling clearly isolated from household app usage.

## Non-goals

- No new admin permissions model in this pass.
- No production data cleanup.
- No change to normal household flows unless required for routing.

## User Flow

- Master admin opens an admin-specific origin such as `https://admin.nestplan...`.
- Normal users open the standard app origin.
- Admin login/session does not overwrite the normal app session in the same browser profile.
- Signed-in non-admins who reach the admin origin see a safe redirect or access-denied state.

## Data Model / Affected Collections

- Reads `masterAdmins/{uid}`.
- Admin tools may read/write existing platform collections such as `registrationCodes`, `appDefaultCategories`, `appGreetingQuotes`, `emailPolicyBlockedDomains`, `emailPolicyOverrides`, and `platformSettings/maintenance`.
- No schema change required by the separation itself.

## Security And Permissions

- Admin origin separation is a UX/session isolation improvement, not the primary security boundary.
- Firestore rules remain the source of truth for admin permissions.
- Non-admin users must not access admin tools even if they can load the admin page shell.
- API key restrictions must include the admin origin and matching Firebase Auth action domain if email actions are used there.

## Validation Rules

- Admin route must require an active `masterAdmins/{uid}` document.
- Auth/rules errors should stay visible for diagnosis.
- Signed-in non-admin sessions should not be allowed to operate admin tooling.

## Edge Cases

- User is admin in one tab and normal user in another.
- User opens admin origin while already signed in as non-admin.
- User opens normal app while signed in as admin.
- API key referrer restrictions block auth action links if the new origin is missing.

## Tests

- Staging admin login on admin origin.
- Normal login on normal origin in the same browser profile.
- Non-admin cannot use admin origin.
- Admin can create and revoke a user creation code.
- Maintenance mode still works from admin origin.

## Rollback Notes

- Hosting rollback can revert routing/origin changes.
- Keep old `?admin=1` route available during transition only if it does not weaken access checks.
- No data rollback expected unless admin tooling behavior changes.

## Open Questions

- Use Firebase Hosting custom domain, subdomain, or separate Firebase Hosting site?
- Should admin use session-only persistence or normal persistence once it has its own origin?
- Should `?admin=1` remain as a fallback after admin origin launches?
