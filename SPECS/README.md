# NestPlan Specs

Specs capture the reasoning for risky work before implementation. Keep them short, practical, and easy to update.

## When A Spec Is Required

Write or update a short spec before changes involving:

- money logic;
- transaction creation, edit, delete, import, or export;
- account ownership;
- auth/session behavior;
- invite-only registration;
- Firebase Auth or Firestore rules;
- production data cleanup;
- admin tooling;
- large schema or data-model changes.

## When A Spec Is Not Required

Skip specs for:

- simple text changes;
- small visual polish;
- tiny CSS tweaks;
- helper extraction already covered by tests;
- documentation-only updates.

## How To Use Specs

- Start from `SPECS/template.md`.
- Aim for one page.
- Prefer bullets over long prose.
- Record the intended behavior, security boundary, validation rules, tests, rollback, and open questions.
- Update the spec when implementation meaningfully changes the plan.
- Move details that become permanent product/security rules into `DECISIONS.md`.

## Status Values

- `Draft`: still being shaped.
- `Planned`: agreed direction, not implemented.
- `In Progress`: implementation started.
- `Staging`: implemented and under staging test.
- `Released`: promoted to production.
- `Paused`: intentionally deferred.
