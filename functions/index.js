const { onCall } = require("firebase-functions/v2/https");

exports.healthcheck = onCall(async () => {
  return {
    ok: true,
    message: "NestPlan Functions scaffold is ready."
  };
});

// Planned next additions once Blaze/Functions are enabled:
// - server-enforced invite-only registration
// - admin-assisted account recovery
// - multi-document transfer creation
// - recurring bill completion
// - future AI receipt parsing hooks
