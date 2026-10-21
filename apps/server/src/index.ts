import { randomUUID } from "node:crypto";
import { LangGraphAgent } from "@ag-ui/langgraph";
import {
  CATALOG_ID,
  inlineCatalogSchema,
  toMiddlewareCatalog,
} from "@arb/shared";
import type { CopilotRuntimeOptions } from "@copilotkit/runtime/v2";
import { CopilotRuntime, InMemoryAgentRunner } from "@copilotkit/runtime/v2";
import { createCopilotExpressHandler } from "@copilotkit/runtime/v2/express";
import express from "express";
import { createStableA2UIActivityMiddleware } from "./stableActivity.js";

const port = Number(process.env.PORT ?? 4000);
const deploymentUrl = process.env.LANGGRAPH_URL ?? "http://127.0.0.1:2024";
const graphId = process.env.LANGGRAPH_GRAPH_ID ?? "requestBuilder";
const instanceId = randomUUID();
const mode = process.env.AGENT_MODE?.trim().toLowerCase();
if (mode !== "fixture" && mode !== "live") {
  throw new Error(
    "AGENT_MODE must be explicitly set to 'fixture' or 'live' for the bridge.",
  );
}

// The runtime pins a nested @ag-ui/client; the cast is type-only and does not alter the agent.
const requestBuilderAgent = new LangGraphAgent({
  deploymentUrl,
  graphId,
  emitRawEvents: false,
});

requestBuilderAgent.use(
  createStableA2UIActivityMiddleware({ live: mode === "live" }),
);

const agents = {
  requestBuilder: requestBuilderAgent,
} as unknown as CopilotRuntimeOptions["agents"];

const runtime = new CopilotRuntime({
  agents,
  runner: new InMemoryAgentRunner(),
  a2ui: {
    injectA2UITool: false,
    a2uiToolNames: [],
    schema: toMiddlewareCatalog(inlineCatalogSchema),
    defaultCatalogId: CATALOG_ID,
  },
});

const app = express();

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    mode,
    instanceId,
    graphId,
    catalogId: CATALOG_ID,
    a2ui: {
      injectA2UITool: false,
      a2uiToolNames: [],
      defaultCatalogId: CATALOG_ID,
    },
  });
});

app.use("/api", (request, response, next) => {
  if (request.method === "POST") {
    const rawLength = request.headers["content-length"];
    if (rawLength === undefined || rawLength.trim() === "") {
      response.status(411).json({
        error: "Content-Length is required so the 64 KiB limit can be enforced",
      });
      return;
    }
  }

  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    response.status(413).json({ error: "Request body exceeds 64 KiB limit" });
    return;
  }
  next();
});

app.use(
  createCopilotExpressHandler({
    runtime,
    basePath: "/api/copilotkit",
    mode: "single-route",
    cors: false,
  }),
);

app.listen(port, "127.0.0.1", () => {
  console.info(
    `[bridge] listening on http://127.0.0.1:${port} (${mode} mode), LangGraph ${deploymentUrl} graph ${graphId}`,
  );
  console.info(
    `[bridge] A2UI middleware enabled with injectA2UITool=false, catalog ${CATALOG_ID}`,
  );
});
