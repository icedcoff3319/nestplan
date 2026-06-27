import { generateRegistrationCode } from "../access-utils.js";
import { normalizeEmail, getEmailDomain } from "../text-utils.js";

const FIREBASE_CONFIGS = {
  staging: {
    apiKey: "AIzaSyBl3FCeIyYKjGTE-Ud4fw0JlXtQmSs-Ge8",
    projectId: "nestplan-staging-863e5",
    appReferrer: "https://nestplan-staging-863e5.web.app/"
  },
  production: {
    apiKey: "AIzaSyACXGeCcSIbP5WM2J10d1xp-BNTmlMpbLI",
    projectId: "nestplan-863e5",
    appReferrer: "https://nestplan-863e5.web.app/"
  }
};

function parseArgs(argv) {
  const options = {
    project: "staging",
    write: false
  };

  argv.forEach(arg => {
    if (arg === "--write") {
      options.write = true;
      return;
    }
    if (arg.startsWith("--project=")) {
      options.project = arg.slice("--project=".length);
      return;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  });

  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/smoke-admin.mjs --project=staging
  node scripts/smoke-admin.mjs --project=staging --write

Environment:
  NESTPLAN_ADMIN_EMAIL       Staging/production master admin email.
  NESTPLAN_ADMIN_PASSWORD    Password for that account.

Behavior:
  Dry-run is the default and only reads admin-gated collections.
  --write creates one disposable registration code, then deletes it.
`);
}

function firestoreBaseUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/%2F/g, "%252F");
}

function firestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

function firestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  return { stringValue: String(value) };
}

function readStringField(document, fieldName) {
  return document?.fields?.[fieldName]?.stringValue || "";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.error?.message || response.statusText || "Request failed.";
    throw new Error(message);
  }

  return payload;
}

async function signInWithPassword({ apiKey, appReferrer, email, password }) {
  return fetchJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: appReferrer
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });
}

async function getDocument({ projectId, idToken, path }) {
  return fetchJson(`${firestoreBaseUrl(projectId)}/${path}`, {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  }).catch(error => {
    if (error.message.includes("not found") || error.message.includes("NOT_FOUND")) {
      return null;
    }
    throw error;
  });
}

async function readCollectionCount({ projectId, idToken, collectionName }) {
  const response = await fetchJson(`${firestoreBaseUrl(projectId)}/${collectionName}?pageSize=1000`, {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  }).catch(error => {
    if (error.message.includes("not found") || error.message.includes("NOT_FOUND")) {
      return { documents: [] };
    }
    throw error;
  });

  return response.documents?.length || 0;
}

async function createDisposableCode({ projectId, idToken, uid, signedInEmail }) {
  const code = generateRegistrationCode();
  const emailNormalized = normalizeEmail(`codex-smoke-${Date.now()}@adsprite.com`);
  const now = new Date();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const documentPath = `registrationCodes/${encodePathSegment(code)}`;

  await fetchJson(`${firestoreBaseUrl(projectId)}/${documentPath}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({
      fields: firestoreFields({
        code,
        emailNormalized,
        emailDomain: getEmailDomain(emailNormalized),
        note: "Codex staging smoke test",
        status: "unused",
        createdByUserId: uid,
        createdByEmail: normalizeEmail(signedInEmail),
        policyOverrideUsed: false,
        createdAt: now,
        updatedAt: now,
        expiresAt,
        consumedAt: null,
        consumedByUserId: null,
        revokedAt: null,
        revokedByUserId: null
      })
    })
  });

  const created = await getDocument({ projectId, idToken, path: documentPath });
  if (!created) {
    throw new Error("Disposable registration code was not created.");
  }

  await fetchJson(`${firestoreBaseUrl(projectId)}/${documentPath}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  const deleted = await getDocument({ projectId, idToken, path: documentPath });
  if (deleted) {
    throw new Error("Disposable registration code was not deleted.");
  }

  return { code, emailNormalized };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const config = FIREBASE_CONFIGS[options.project];
  if (!config) {
    throw new Error(`Unknown project "${options.project}". Use staging or production.`);
  }

  const email = process.env.NESTPLAN_ADMIN_EMAIL;
  const password = process.env.NESTPLAN_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set NESTPLAN_ADMIN_EMAIL and NESTPLAN_ADMIN_PASSWORD before running this script.");
  }

  const auth = await signInWithPassword({
    apiKey: config.apiKey,
    appReferrer: config.appReferrer,
    email,
    password
  });

  const masterAdmin = await getDocument({
    projectId: config.projectId,
    idToken: auth.idToken,
    path: `masterAdmins/${encodePathSegment(auth.localId)}`
  });
  const isMasterAdmin = readStringField(masterAdmin, "status") === "active";

  if (!isMasterAdmin) {
    throw new Error("Signed-in account is not an active master admin.");
  }

  const summary = {
    project: options.project,
    firebaseProjectId: config.projectId,
    signedInAs: normalizeEmail(auth.email || email),
    signedInAsMasterAdmin: isMasterAdmin,
    mode: options.write ? "write" : "dry-run",
    registrationCodeCount: await readCollectionCount({ projectId: config.projectId, idToken: auth.idToken, collectionName: "registrationCodes" }),
    defaultCategoryCount: await readCollectionCount({ projectId: config.projectId, idToken: auth.idToken, collectionName: "appDefaultCategories" }),
    greetingQuoteCount: await readCollectionCount({ projectId: config.projectId, idToken: auth.idToken, collectionName: "appGreetingQuotes" }),
    blockedDomainCount: await readCollectionCount({ projectId: config.projectId, idToken: auth.idToken, collectionName: "emailPolicyBlockedDomains" }),
    emailOverrideCount: await readCollectionCount({ projectId: config.projectId, idToken: auth.idToken, collectionName: "emailPolicyOverrides" })
  };

  if (options.write) {
    const disposable = await createDisposableCode({
      projectId: config.projectId,
      idToken: auth.idToken,
      uid: auth.localId,
      signedInEmail: auth.email || email
    });
    summary.disposableCodeCreatedAndDeleted = true;
    summary.disposableEmail = disposable.emailNormalized;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(`Admin smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
