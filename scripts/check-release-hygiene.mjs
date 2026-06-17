import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

const REQUIRED_HOSTING_IGNORES = [
  "firebase.json",
  "firestore.rules",
  "firestore.indexes.json",
  "storage.rules",
  ".firebaserc",
  ".git/**",
  ".firebase/**",
  ".edge-headless/**",
  ".tools/**",
  ".codex/**",
  ".gitignore",
  "functions/**",
  "node_modules/**",
  "**/node_modules/**",
  "scripts/**",
  "tests/**",
  "package.json",
  "package-lock.json",
  "*.log",
  "*.md",
  "firebase-debug.log",
  "firestore-debug.log",
  "ui-debug.log",
  "**/.*"
];

const EXPECTED_PROJECTS = {
  production: "nestplan-863e5",
  staging: "nestplan-staging-863e5"
};

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractSingleMatch(content, regex, label) {
  const match = content.match(regex);
  assert(match, `Missing ${label}.`);
  return match[1];
}

function assertIncludesAll(actualItems, requiredItems, label) {
  const missing = requiredItems.filter(item => !actualItems.includes(item));
  assert(!missing.length, `${label} is missing: ${missing.join(", ")}`);
}

async function checkFirebaseAliases() {
  const firebaserc = await readJson(".firebaserc");
  const projects = firebaserc.projects || {};
  assert(projects.production === EXPECTED_PROJECTS.production, ".firebaserc production alias points to the wrong project.");
  assert(projects.staging === EXPECTED_PROJECTS.staging, ".firebaserc staging alias points to the wrong project.");
}

async function checkHostingConfig() {
  const firebaseConfig = await readJson("firebase.json");
  assert(firebaseConfig.hosting?.public === ".", "Firebase Hosting public directory should stay as the project root.");
  assertIncludesAll(firebaseConfig.hosting?.ignore || [], REQUIRED_HOSTING_IGNORES, "Firebase Hosting ignore list");
}

async function checkBuildMarkers() {
  const indexHtml = await readText("index.html");
  const appJs = await readText("app.js");
  const buildMarker = extractSingleMatch(indexHtml, /window\.__nestplanBuild\s*=\s*"([^"]+)"/, "window.__nestplanBuild");
  const markers = [
    extractSingleMatch(indexHtml, /styles\.css\?v=([^"]+)"/, "styles.css cache marker"),
    extractSingleMatch(indexHtml, /import\("\.\/app\.js\?v=([^"]+)"\)/, "app.js cache marker"),
    extractSingleMatch(appJs, /firebase-client\.js\?v=([^"]+)"/, "firebase-client.js cache marker"),
    extractSingleMatch(appJs, /constants\.js\?v=([^"]+)"/, "constants.js cache marker"),
    extractSingleMatch(appJs, /category-import\.js\?v=([^"]+)"/, "category-import.js cache marker"),
    extractSingleMatch(appJs, /csv-export\.js\?v=([^"]+)"/, "csv-export.js cache marker"),
    extractSingleMatch(appJs, /ledger-display\.js\?v=([^"]+)"/, "ledger-display.js cache marker"),
    extractSingleMatch(appJs, /format-utils\.js\?v=([^"]+)"/, "format-utils.js cache marker"),
    extractSingleMatch(appJs, /window\.__nestplanBuild \|\| "([^"]+)"/, "verification return fallback marker")
  ];

  markers.forEach(marker => {
    assert(marker === buildMarker, `Build marker mismatch: expected ${buildMarker}, found ${marker}.`);
  });
}

async function checkFirebaseEnvironmentRouting() {
  const firebaseClient = await readText("firebase-client.js");
  assert(firebaseClient.includes(`projectId: "${EXPECTED_PROJECTS.production}"`), "Production Firebase project ID is missing from firebase-client.js.");
  assert(firebaseClient.includes("window.__nestplanStagingFirebaseConfig"), "Staging Firebase config hook is missing from firebase-client.js.");
  assert(firebaseClient.includes("host.includes(\"-staging\")"), "Staging host routing is missing from firebase-client.js.");
}

async function main() {
  const checks = [
    ["Firebase aliases", checkFirebaseAliases],
    ["Hosting config", checkHostingConfig],
    ["Build markers", checkBuildMarkers],
    ["Firebase environment routing", checkFirebaseEnvironmentRouting]
  ];

  for (const [label, check] of checks) {
    await check();
    console.log(`OK ${label}`);
  }

  console.log("Release hygiene checks passed.");
}

main().catch(error => {
  console.error(`Release hygiene check failed: ${error.message}`);
  process.exitCode = 1;
});
