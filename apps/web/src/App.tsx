import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  CopilotKit,
  UseAgentUpdate,
  useAgent,
  useCopilotChatConfiguration,
  useCopilotKit,
} from "@copilotkit/react-core/v2";
import { useCallback, useEffect, useRef, useState } from "react";
import { catalog } from "./catalog.js";
import { Inspector } from "./Inspector.js";

const EXAMPLE_PROMPTS = [
  {
    title: "Login bug",
    message: "I found a login bug. Help me report it.",
  },
  {
    title: "Dashboard feature",
    message: "I want to propose a new dashboard feature.",
  },
  {
    title: "Project review meeting",
    message: "I need to arrange a project review meeting.",
  },
] as const;

const MODE_STYLES = {
  live: "border-emerald-300 bg-emerald-100 text-emerald-900",
  fixture: "border-amber-300 bg-amber-100 text-amber-900",
  unknown: "border-rose-300 bg-rose-100 text-rose-900",
} as const;

export function App() {
  const [transportError, setTransportError] = useState<string | null>(null);
  const [runtimeEpoch, setRuntimeEpoch] = useState(0);

  return (
    <CopilotKit
      key={runtimeEpoch}
      runtimeUrl="/api/copilotkit"
      agentId="requestBuilder"
      useSingleEndpoint={true}
      enableInspector={false}
      showDevConsole={false}
      a2ui={{ catalog }}
      onError={({ error }) => {
        setTransportError(error.message);
      }}
    >
      <CopilotChatConfigurationProvider agentId="requestBuilder">
        <Workspace
          transportError={transportError}
          onDismissTransportError={() => setTransportError(null)}
          onRuntimeReconnect={() => {
            setTransportError(null);
            setRuntimeEpoch((current) => current + 1);
          }}
        />
      </CopilotChatConfigurationProvider>
    </CopilotKit>
  );
}

function Workspace({
  transportError,
  onDismissTransportError,
  onRuntimeReconnect,
}: {
  transportError: string | null;
  onDismissTransportError: () => void;
  onRuntimeReconnect: () => void;
}) {
  const config = useCopilotChatConfiguration();
  const threadId = config?.threadId ?? "uninitialized";
  const startNewThread = config?.startNewThread;
  const { agent, isReady } = useAgent({
    agentId: "requestBuilder",
    updates: [
      UseAgentUpdate.OnStateChanged,
      UseAgentUpdate.OnRunStatusChanged,
      UseAgentUpdate.OnMessagesChanged,
    ],
    throttleMs: 100,
  });
  const { copilotkit } = useCopilotKit();
  const [bridgeMode, setBridgeMode] = useState<"fixture" | "live" | "unknown">(
    "unknown",
  );
  const [graphMode, setGraphMode] = useState<"fixture" | "live" | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState(false);
  const mode = graphMode ?? bridgeMode;
  const modeMismatch =
    bridgeMode !== "unknown" && graphMode !== null && bridgeMode !== graphMode;
  const error = healthError
    ? "Bridge health check failed. Start the bridge on port 4000."
    : (transportError ?? runError);
  const busy = agent.isRunning;
  const hasMessages = agent.messages.length > 0;
  const wasRunningRef = useRef(false);
  const healthErrorRef = useRef(false);
  const pendingReconnectRef = useRef(false);
  const isRunningRef = useRef(agent.isRunning);
  const onRuntimeReconnectRef = useRef(onRuntimeReconnect);

  useEffect(() => {
    isRunningRef.current = agent.isRunning;
  }, [agent.isRunning]);

  useEffect(() => {
    onRuntimeReconnectRef.current = onRuntimeReconnect;
  }, [onRuntimeReconnect]);

  const refreshHealth = useCallback(async (): Promise<boolean> => {
    const wasHealthError = healthErrorRef.current;
    try {
      const response = await fetch("/api/health", {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        healthErrorRef.current = true;
        setHealthError(true);
        setBridgeMode("unknown");
        return false;
      }
      const data = (await response.json()) as { mode?: string };
      setBridgeMode(
        data.mode === "live"
          ? "live"
          : data.mode === "fixture"
            ? "fixture"
            : "unknown",
      );
      healthErrorRef.current = false;
      setHealthError(false);
      if (wasHealthError) {
        if (isRunningRef.current) {
          pendingReconnectRef.current = true;
        } else {
          onRuntimeReconnectRef.current();
        }
      }
      return true;
    } catch {
      healthErrorRef.current = true;
      setHealthError(true);
      setBridgeMode("unknown");
      return false;
    }
  }, []);

  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = agent.isRunning;
    if (agent.isRunning && !wasRunning) {
      setRunError(null);
      onDismissTransportError();
    }
    if (!agent.isRunning && wasRunning && pendingReconnectRef.current) {
      pendingReconnectRef.current = false;
      onRuntimeReconnectRef.current();
    }
  }, [agent.isRunning, onDismissTransportError]);

  useEffect(() => {
    void refreshHealth();
    const interval = setInterval(() => {
      void refreshHealth();
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [refreshHealth]);

  function handleNewRequest() {
    if (busy) return;
    agent.setMessages([]);
    agent.setState({});
    startNewThread?.();
    setRunError(null);
    onDismissTransportError();
  }

  async function handleExample(message: string) {
    if (busy || !isReady) return;
    setRunError(null);
    onDismissTransportError();
    agent.addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    });
    try {
      await copilotkit.runAgent({ agent });
    } catch (caught) {
      setRunError(
        caught instanceof Error ? caught.message : "Example run failed",
      );
    }
  }

  async function handleRetry() {
    if (busy) return;
    if (healthError) {
      await refreshHealth();
      return;
    }
    setRunError(null);
    onDismissTransportError();
    try {
      await copilotkit.runAgent({ agent });
    } catch (caught) {
      setRunError(
        caught instanceof Error ? caught.message : "Retry failed unexpectedly",
      );
    }
  }

  function dismissError() {
    setRunError(null);
    onDismissTransportError();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">
              Adaptive Request Builder
            </h1>
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Stage 4
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Deterministic review · checkpoint-anchored updates
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full border px-2 py-1 font-medium ${MODE_STYLES[mode]}`}
          >
            {mode === "live"
              ? "LIVE"
              : mode === "fixture"
                ? "FIXTURE"
                : "MODE UNKNOWN"}
          </span>
          <span
            className={
              busy
                ? "rounded-full border border-sky-300 bg-sky-100 px-2 py-1 font-medium text-sky-900"
                : error
                  ? "rounded-full border border-rose-300 bg-rose-100 px-2 py-1 font-medium text-rose-900"
                  : "rounded-full border border-slate-300 bg-slate-100 px-2 py-1 font-medium text-slate-700"
            }
          >
            {busy ? "RUNNING" : error ? "ERROR" : "IDLE"}
          </span>
          <span className="font-mono text-slate-500">
            thread {shortId(threadId)}
          </span>
          <button
            type="button"
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleNewRequest}
            disabled={busy}
          >
            New request
          </button>
        </div>
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
            ? "LIVE MODEL - generate_a2ui creates one form; apply_request_changes revises the same surface. Review and submit are deterministic and demo-only."
            : mode === "fixture"
              ? "FIXTURE - NO LIVE MODEL. Fixed A2UI surfaces with deterministic review; follow-up edits require the live model."
              : "Bridge health unavailable. Start the bridge on port 4000."}
        <span className="ml-2 text-xs opacity-80">
          {modeMismatch
            ? "Do not trust this run until the modes match."
            : mode === "live"
              ? "Demo only; prompts are sent to the configured model provider. Do not enter sensitive or real personal data."
              : "Demo only; fixture mode uses no model provider. Do not enter sensitive or real personal data."}
        </span>
      </div>

      {error ? (
        <div
          className="flex flex-wrap items-center gap-3 border-b border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-950"
          role="alert"
        >
          <span className="min-w-0 flex-1 break-words">
            <strong>{healthError ? "Bridge unavailable." : "Run or transport error."}</strong>{" "}
            {cap(error, 300)}
          </span>
          <button
            type="button"
            className="rounded border border-rose-400 bg-white px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleRetry}
            disabled={busy}
          >
            {healthError ? "Reconnect" : "Retry last run"}
          </button>
          <button
            type="button"
            className="rounded border border-rose-400 bg-white px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleNewRequest}
            disabled={busy}
          >
            New request
          </button>
          {!healthError ? (
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-rose-800 hover:bg-rose-100"
              onClick={dismissError}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(380px,1fr)] lg:overflow-hidden">
        <section className="flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:min-h-0">
          {!hasMessages ? (
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Try an example
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map(({ title, message }) => (
                  <button
                    key={title}
                    type="button"
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-teal-500 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void handleExample(message)}
                    disabled={busy || !isReady}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <CopilotChat
              key={threadId}
              agentId="requestBuilder"
              labels={{
                chatInputPlaceholder: "Describe your request, or pick an example",
              }}
              className="h-full"
            />
          </div>
        </section>
        <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:min-h-0">
          <Inspector
            threadId={threadId}
            onGraphMode={setGraphMode}
            onRunError={setRunError}
          />
        </aside>
      </main>
    </div>
  );
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function cap(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
