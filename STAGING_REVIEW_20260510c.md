# Staging Review - 20260510c

## Admin Page Findings

- Default categories, greeting library, and blocked email domains are not visible in the admin page.
- Default categories do appear to exist in staging data because normal users can apply/use them.
- Creating a user code takes more than one minute.
- While code creation is processing, the UI does not clearly indicate that work is happening.
- Repeated clicks on `Create code` can create many registration codes.
- The app needs a loading/progress state for long-running actions, including:
  - creating user codes
  - page/view transitions
  - login to dashboard transition
- During login, the login page appears idle while the dashboard is actually loading.

## User Page Findings

- The Investment page and its current normal-user functions are not functionally usable in staging.
- Investment should be revisited as a product concept before patching the current implementation.

## Discussion Direction

- Revamp the Investment feature instead of continuing with the current page shape.
- The next planning pass should define the investment model around NestPlan's core purpose: household finance visibility, spending discipline, and simple tracking before detailed investment analytics.
