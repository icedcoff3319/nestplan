import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localJava = findJavaExecutable(path.join(projectRoot, ".tools", "java"));
const env = { ...process.env };

if (localJava) {
  const javaBin = path.dirname(localJava);
  env.JAVA_HOME = path.dirname(javaBin);
  prependToPath(javaBin);
}

prependToPath(path.dirname(process.execPath));

const javaCheck = spawnSync("java", ["-version"], { env, stdio: "ignore" });
if (javaCheck.error || javaCheck.status !== 0) {
  console.error("Java is required for the Firestore emulator.");
  console.error("Install Java 21 LTS, or keep a portable Java runtime under .tools/java.");
  process.exit(1);
}

const npxRunner = resolveNpxRunner();
const nodeTestCommand = "node --test tests/firestore-rules.test.mjs";
const firebaseArgs = [
  "--yes",
  "firebase-tools@14.17.0",
  "emulators:exec",
  "--only",
  "firestore",
  "--project",
  "nestplan-rules-test",
  nodeTestCommand
];
const result = runFirebaseTools(npxRunner, firebaseArgs);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

function findJavaExecutable(rootDir) {
  if (!existsSync(rootDir)) {
    return null;
  }

  const candidates = process.platform === "win32" ? ["java.exe"] : ["java"];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const fullPath = path.join(current, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        stack.push(fullPath);
      } else if (candidates.includes(entry)) {
        return fullPath;
      }
    }
  }

  return null;
}

function resolveNpxRunner() {
  if (process.platform === "win32") {
    const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
    if (existsSync(npxCli)) {
      return {
        command: process.execPath,
        argsPrefix: [npxCli]
      };
    }
  }

  return {
    command: "npx",
    argsPrefix: []
  };
}

function runFirebaseTools(runner, args) {
  return spawnSync(runner.command, [...runner.argsPrefix, ...args], {
    cwd: projectRoot,
    env,
    stdio: "inherit"
  });
}

function prependToPath(value) {
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = `${value}${path.delimiter}${env[pathKey] || ""}`;
}
