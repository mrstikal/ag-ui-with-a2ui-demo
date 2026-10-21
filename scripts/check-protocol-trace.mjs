import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.argv[2] ?? "docs/protocol-trace.md");
const text = readFileSync(path, "utf8");
const failures = [];

const forbidden = [
  "sk-",
  "api_key",
  "bearer",
  "authorization",
  "model_api_key",
  "I found a login bug",
  "I want to propose a new dashboard feature",
  "I need to arrange a project review meeting",
  "Create a request form for ordering a new laptop",
  "Safari sign-out",
  "Safari users are signed out",
  "Safari loses sessions",
  "Make this a high-priority",
  "Demo only - nothing was sent.",
];
for (const needle of forbidden) {
  if (text.toLowerCase().includes(needle.toLowerCase())) {
    failures.push(`forbidden content present: ${needle}`);
  }
}

for (const required of [
  "# Protocol trace",
  "## Initial generation - bug example",
  "## Stage 4 journey - follow-up update",
  "## Stage 4 journey - submit",
  "`ACTIVITY_SNAPSHOT`",
  "createSurface(",
  "updateComponents(",
  "updateDataModel(",
  "a2uiOperations=",
]) {
  if (!text.includes(required)) {
    failures.push(`required trace content missing: ${required}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[trace] FAIL: ${failure}`);
  }
  process.exit(1);
}

console.info(
  `[trace] PASS: ${path} contains the ordered AG-UI/A2UI sections and no known secrets or synthetic user values`,
);
