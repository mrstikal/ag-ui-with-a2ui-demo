import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const envPath = "apps/agent/.env";
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

if (!process.env.MODEL_ID?.trim() || !process.env.MODEL_API_KEY?.trim()) {
  console.error(
    "Live browser suite is opt-in. Configure MODEL_ID and MODEL_API_KEY (or apps/agent/.env) and rerun.",
  );
  process.exit(2);
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "test", "--config", "playwright.live.config.ts"],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
