import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const BRIDGE_URL = "http://127.0.0.1:4000";
export const AGENT_URL = "http://127.0.0.1:2024";

const children = [];

export async function isUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureService({ name, url, command, env }) {
  if (await isUp(url)) {
    console.info(`[e2e] ${name} already running at ${url}`);
    return;
  }

  console.info(`[e2e] starting ${name}: ${command}`);
  const child = spawn(command, {
    cwd: ROOT,
    shell: true,
    detached: process.platform !== "win32",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  const collect = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (logs.length > 80) {
      logs.splice(0, logs.length - 80);
    }
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    if (code !== 0 && code !== null) {
      console.error(`[e2e] ${name} exited with code ${code}`);
    }
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await isUp(url)) {
      children.push({ name, child });
      return;
    }
    if (exited) {
      throw new Error(
        `[e2e] ${name} exited before becoming ready:\n${logs.join("")}`,
      );
    }
    await delay(500);
  }

  stopChild(child);
  throw new Error(`[e2e] ${name} did not become ready:\n${logs.join("")}`);
}

export function stopAll() {
  for (const { child } of children.splice(0)) {
    stopChild(child);
  }
}

function stopChild(child) {
  const killGroup = (signal) => {
    try {
      if (process.platform !== "win32" && child.pid) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch {
      // Already gone.
    }
  };

  killGroup("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      killGroup("SIGKILL");
    }
  }, 3000);
  timer.unref();
}

export async function runAgent(
  body,
  { expectSse = true, timeoutMs = 120_000 } = {},
) {
  const response = await fetch(`${BRIDGE_URL}/api/copilotkit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      method: "agent/run",
      params: { agentId: "requestBuilder" },
      body,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`agent/run failed with ${response.status}: ${text}`);
  }

  if (!expectSse) {
    return [];
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const text = await response.text();
    throw new Error(`expected text/event-stream, received: ${text}`);
  }

  const events = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeFrame = (frame) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") {
      return;
    }
    events.push(JSON.parse(data));
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      consumeFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim().length > 0) {
    consumeFrame(buffer);
  }

  return events;
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(`[e2e] assertion failed: ${message}`);
  }
}

export function textOf(events) {
  return events
    .filter((event) => event.type === "TEXT_MESSAGE_CONTENT")
    .map((event) => event.delta ?? "")
    .join("");
}
