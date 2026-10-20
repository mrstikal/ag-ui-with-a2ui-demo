import type { BaseEvent } from "@ag-ui/core";
import {
  CopilotChat,
  CopilotKit,
  UseAgentUpdate,
  useAgent,
} from "@copilotkit/react-core/v2";
import { useEffect, useState } from "react";
import { catalog } from "./catalog.js";

interface EventRow {
  id: number;
  type: string;
  detail: string;
  at: string;
}

let nextRowId = 1;

function summarizeEvent(event: BaseEvent): EventRow {
  const record = event as unknown as Record<string, unknown>;
  const type = String(record.type ?? "UNKNOWN");
  let detail = "";

  switch (type) {
    case "RUN_STARTED":
      detail = `thread=${String(record.threadId ?? "")} run=${String(record.runId ?? "")}`;
      break;
    case "RUN_FINISHED":
    case "RUN_ERROR":
      detail = `run=${String(record.runId ?? "")}`;
      break;
    case "TEXT_MESSAGE_CONTENT":
      detail = `delta=${String(record.delta ?? "").length} chars`;
      break;
    case "STATE_SNAPSHOT": {
      const snapshot =
        record.snapshot && typeof record.snapshot === "object"
          ? (record.snapshot as Record<string, unknown>)
          : {};
      detail = JSON.stringify({
        status: snapshot.status,
        revision: snapshot.revision,
        surfaceId: snapshot.surfaceId,
        category: snapshot.category,
        summary: snapshot.summary,
        mode: snapshot.mode,
      });
      break;
    }
    case "ACTIVITY_SNAPSHOT": {
      const content =
        record.content && typeof record.content === "object"
          ? (record.content as Record<string, unknown>)
          : {};
      const operations = Array.isArray(content.a2ui_operations)
        ? content.a2ui_operations
        : [];
      const kinds = operations.map((operation) => {
        if (!operation || typeof operation !== "object") {
          return "unknown";
        }
        return Object.keys(operation as Record<string, unknown>).find(
          (key) => key !== "version",
        );
      });
      detail = `activity=${String(record.activityType ?? "")} ops=[${kinds.join(", ")}]`;
      break;
    }
    case "TOOL_CALL_START":
      detail = `tool=${String(record.toolCallName ?? "")} id=${String(record.toolCallId ?? "")}`;
      break;
    case "TOOL_CALL_RESULT":
      detail = `id=${String(record.toolCallId ?? "")}`;
      break;
    default:
      detail = String(record.runId ? `run=${record.runId}` : "");
  }

  return {
    id: nextRowId++,
    type,
    detail,
    at: new Date().toISOString().slice(11, 23),
  };
}

function Diagnostics({
  onGraphMode,
}: {
  onGraphMode: (mode: "fixture" | "live") => void;
}) {
  const { agent, isReady } = useAgent({
    agentId: "requestBuilder",
    updates: [UseAgentUpdate.OnStateChanged],
  });
  const [rows, setRows] = useState<EventRow[]>([]);
  const agentState = agent.state as Record<string, unknown> | undefined;

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const subscription = agent.subscribe({
      onEvent: ({ event }) => {
        if (event.type === "STATE_SNAPSHOT") {
          const snapshot =
            (event as unknown as { snapshot?: Record<string, unknown> })
              .snapshot ?? {};
          if (snapshot.mode === "fixture" || snapshot.mode === "live") {
            onGraphMode(snapshot.mode);
          }
        }
        setRows((previous) => [...previous.slice(-99), summarizeEvent(event)]);
      },
    });

    return () => subscription.unsubscribe();
  }, [agent, isReady, onGraphMode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-800">
          Stage 0 diagnostics
        </h2>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          onClick={() => setRows([])}
        >
          Clear
        </button>
      </div>
      <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
        Real AG-UI events from this agent. State snapshots are summarized without
        messages or tool payloads.
      </p>
      <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-600">
        hook state: status={String(agentState?.status ?? "n/a")} revision=
        {String(agentState?.revision ?? "n/a")} mode=
        {String(agentState?.mode ?? "n/a")}
      </p>
      <ol
        className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-5"
        aria-live="polite"
      >
        {rows.length === 0 ? (
          <li className="text-slate-400">
            Waiting for a run. Send a message to start.
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id} className="border-b border-slate-100 py-1">
              <span className="text-slate-400">{row.at}</span>{" "}
              <span className="font-semibold text-teal-800">{row.type}</span>
              {row.detail ? (
                <span className="block break-all text-slate-600">
                  {row.detail}
                </span>
              ) : null}
            </li>
          ))
        )}
      </ol>
    </div>
  );
}

export function App() {
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());
  const [bridgeMode, setBridgeMode] = useState<"fixture" | "live" | "unknown">(
    "unknown",
  );
  const [graphMode, setGraphMode] = useState<"fixture" | "live" | null>(null);
  const mode = graphMode ?? bridgeMode;
  const modeMismatch =
    bridgeMode !== "unknown" && graphMode !== null && bridgeMode !== graphMode;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json())
      .then((data: { mode?: string }) => {
        if (!cancelled) {
          setBridgeMode(
            data.mode === "live"
              ? "live"
              : data.mode === "fixture"
                ? "fixture"
                : "unknown",
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBridgeMode("unknown");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agentId="requestBuilder"
      useSingleEndpoint={true}
      a2ui={{ catalog }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Adaptive Request Builder
            </h1>
            <p className="text-xs text-slate-500">
              Stage 0 compatibility vertical slice
            </p>
          </div>
          <button
            type="button"
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
            onClick={() => setThreadId(crypto.randomUUID())}
          >
            New request
          </button>
        </header>

        <div
          className={
            modeMismatch
              ? "border-b border-rose-300 bg-rose-100 px-4 py-2 text-sm text-rose-950"
              : mode === "live"
                ? "border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
                : mode === "fixture"
                  ? "border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
                  : "border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900"
          }
          role="status"
          aria-live="polite"
        >
          {modeMismatch
            ? `MODE MISMATCH - bridge reports ${bridgeMode}, graph reports ${graphMode}. Stop and fix the two AGENT_MODE values.`
            : mode === "live"
              ? "LIVE MODEL - prompts are sent to the configured model provider."
              : mode === "fixture"
                ? "FIXTURE - NO LIVE MODEL. Deterministic Stage 0 surface only."
                : "Bridge health unavailable. Start the bridge on port 4000."}
          <span className="ml-2 text-xs opacity-80">
            {modeMismatch
              ? "Do not trust this run until the modes match."
              : mode === "live"
                ? "Demo only; prompts are sent to the configured model provider. Do not enter sensitive or real personal data."
                : "Demo only; fixture mode uses no model provider. Do not enter sensitive or real personal data."}
          </span>
        </div>

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <CopilotChat
              agentId="requestBuilder"
              threadId={threadId}
              labels={{ chatInputPlaceholder: "Describe your request" }}
            />
          </section>
          <aside className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Diagnostics onGraphMode={setGraphMode} />
          </aside>
        </main>
      </div>
    </CopilotKit>
  );
}
