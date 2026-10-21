import { UseAgentUpdate, useAgent } from "@copilotkit/react-core/v2";
import type { BaseEvent } from "@ag-ui/core";
import { useEffect, useRef, useState } from "react";
import {
  boundJson,
  describeEvent,
  type ActionEvidence,
  type InspectorFamily,
} from "./inspector.js";
import {
  EMPTY_SURFACE,
  reduceSurfaceActivity,
  type SurfaceSummary,
} from "./surface.js";
import { SurfaceInspector } from "./SurfaceInspector.js";

type Filter =
  | "all"
  | "state"
  | "a2ui"
  | "text"
  | "tools"
  | "messages"
  | "errors"
  | "raw";

interface InspectorRow {
  id: number;
  seq: number;
  at: string;
  family: InspectorFamily;
  type: string;
  runId?: string;
  threadId?: string;
  toolCallId?: string;
  messageId?: string;
  summary: string;
  payload: Record<string, unknown>;
  payloadKey: string;
  repeat: number;
  orphan?: boolean;
}

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "state", label: "State" },
  { key: "a2ui", label: "A2UI" },
  { key: "text", label: "Text" },
  { key: "tools", label: "Tools" },
  { key: "messages", label: "Messages" },
  { key: "errors", label: "Errors" },
  { key: "raw", label: "Raw" },
];

const FAMILY_STYLES: Record<InspectorFamily, string> = {
  run: "bg-slate-100 text-slate-700",
  text: "bg-sky-100 text-sky-800",
  tool: "bg-indigo-100 text-indigo-800",
  state: "bg-emerald-100 text-emerald-800",
  messages: "bg-cyan-100 text-cyan-800",
  a2ui: "bg-violet-100 text-violet-800",
  activity: "bg-fuchsia-100 text-fuchsia-800",
  error: "bg-rose-100 text-rose-800",
  raw: "bg-slate-200 text-slate-600",
  other: "bg-slate-100 text-slate-600",
};

interface InspectorProps {
  threadId: string;
  onGraphMode: (mode: "fixture" | "live") => void;
  onRunError: (message: string) => void;
}

export function Inspector({
  threadId,
  onGraphMode,
  onRunError,
}: InspectorProps) {
  const { agent } = useAgent({
    agentId: "requestBuilder",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const [rows, setRows] = useState<InspectorRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [action, setAction] = useState<ActionEvidence | null>(null);
  const [surface, setSurface] = useState<SurfaceSummary>(EMPTY_SURFACE);
  const [announcement, setAnnouncement] = useState("");
  const [currentRun, setCurrentRun] = useState<{
    runId?: string;
    threadId?: string;
  }>({ threadId });
  const nextRowId = useRef(1);
  const recordedEventsRef = useRef(0);
  const rowsRef = useRef<InspectorRow[]>([]);
  const surfaceRef = useRef<SurfaceSummary>(EMPTY_SURFACE);
  const actionRef = useRef<ActionEvidence | null>(null);
  const pendingEventsRef = useRef<BaseEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const toolNames = useRef(new Map<string, string>());
  const currentRunRef = useRef<{ runId?: string; threadId?: string }>({
    threadId,
  });
  const runOpenRef = useRef(false);
  const agentState = agent.state as Record<string, unknown> | undefined;

  useEffect(() => {
    setRows([]);
    rowsRef.current = [];
    setAction(null);
    actionRef.current = null;
    setSurface(EMPTY_SURFACE);
    surfaceRef.current = EMPTY_SURFACE;
    setAnnouncement("");
    setFilter("all");
    setCurrentRun({ threadId });
    currentRunRef.current = { threadId };
    runOpenRef.current = false;
    toolNames.current.clear();
    pendingEventsRef.current = [];
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    nextRowId.current = 1;
    recordedEventsRef.current = 0;
  }, [threadId]);

  useEffect(() => {
    const flush = () => {
      flushTimerRef.current = null;
      const events = pendingEventsRef.current;
      pendingEventsRef.current = [];
      if (events.length === 0) {
        return;
      }

      let nextRows = rowsRef.current;
      let nextSurface = surfaceRef.current;
      let nextAction = actionRef.current;
      let nextRun: { runId?: string; threadId?: string } | null = null;
      let nextGraphMode: "fixture" | "live" | null = null;
      let nextRunError: string | null = null;
      let nextAnnouncement: string | null = null;
      let finishedAnnouncement = false;

      for (const event of events) {
        const record = event as unknown as Record<string, unknown>;
        const type = String(record.type ?? "UNKNOWN");
        const eventThreadId =
          typeof record.threadId === "string" ? record.threadId : undefined;
        if (eventThreadId && eventThreadId !== threadId) {
          continue;
        }
        recordedEventsRef.current += 1;

        const toolCallId =
          typeof record.toolCallId === "string"
            ? record.toolCallId
            : undefined;
        let toolName: string | undefined;
        if (type === "TOOL_CALL_START") {
          toolName =
            typeof record.toolCallName === "string"
              ? record.toolCallName
              : undefined;
          if (toolCallId && toolName) {
            toolNames.current.set(toolCallId, toolName);
          }
        } else if (toolCallId) {
          toolName = toolNames.current.get(toolCallId);
        }

        const runWasOpen = runOpenRef.current;
        if (type === "RUN_STARTED") {
          currentRunRef.current = {
            runId:
              typeof record.runId === "string" ? record.runId : undefined,
            threadId: eventThreadId ?? threadId,
          };
          runOpenRef.current = true;
          nextRun = currentRunRef.current;
          recordedEventsRef.current = 1;
          finishedAnnouncement = false;
          nextAnnouncement = "Run started.";
        } else if (type === "RUN_FINISHED" || type === "RUN_ERROR") {
          runOpenRef.current = false;
          if (type === "RUN_FINISHED") {
            finishedAnnouncement = true;
            nextAnnouncement = "Run finished.";
          } else {
            nextAnnouncement = "Run failed.";
          }
        }

        const orphan = type !== "RUN_STARTED" && !runWasOpen;
        const description = describeEvent(event, toolName);
        if (
          type === "RUN_FINISHED" &&
          typeof record.runId === "string" &&
          currentRunRef.current.runId &&
          record.runId !== currentRunRef.current.runId
        ) {
          description.summary = `run finished ${shortId(
            record.runId,
          )} (event run ID differs from started ${shortId(
            currentRunRef.current.runId,
          )})`;
        }
        if (description.action) {
          nextAction = {
            ...description.action,
            receivedAt: timeNow(),
            toolCallId,
          };
        }
        if (
          type === "ACTIVITY_SNAPSHOT" &&
          record.activityType === "a2ui-surface"
        ) {
          nextSurface = reduceSurfaceActivity(nextSurface, event);
        }
        if (type === "STATE_SNAPSHOT") {
          const snapshot =
            record.snapshot && typeof record.snapshot === "object"
              ? (record.snapshot as Record<string, unknown>)
              : {};
          if (snapshot.mode === "fixture" || snapshot.mode === "live") {
            nextGraphMode = snapshot.mode;
          }
        }
        if (type === "RUN_ERROR") {
          nextRunError =
            typeof record.message === "string"
              ? record.message
              : "Agent run failed";
        }

        const seq = nextRowId.current++;
        const at = timeNow();
        const payloadKey = JSON.stringify(description.payload);
        const lastSemanticIndex = nextRows.findLastIndex(
          (row) => row.family !== "raw",
        );
        const last =
          lastSemanticIndex >= 0 ? nextRows[lastSemanticIndex] : undefined;
        if (
          type === "STATE_SNAPSHOT" &&
          last &&
          last.type === type &&
          last.payloadKey === payloadKey
        ) {
          nextRows = [
            ...nextRows.slice(0, lastSemanticIndex),
            {
              ...last,
              at,
              repeat: last.repeat + 1,
              orphan: Boolean(last.orphan || orphan),
            },
            ...nextRows.slice(lastSemanticIndex + 1),
          ];
        } else {
          nextRows = [
            ...nextRows.slice(-199),
            {
              id: seq,
              seq,
              at,
              family: description.family,
              type,
              runId:
                (typeof record.runId === "string"
                  ? record.runId
                  : undefined) ?? currentRunRef.current.runId,
              threadId:
                eventThreadId ?? currentRunRef.current.threadId ?? threadId,
              toolCallId,
              messageId:
                typeof record.messageId === "string"
                  ? record.messageId
                  : undefined,
              summary: description.summary,
              payload: description.payload,
              payloadKey,
              repeat: 1,
              orphan,
            },
          ];
        }
      }

      rowsRef.current = nextRows;
      surfaceRef.current = nextSurface;
      actionRef.current = nextAction;
      setRows(nextRows);
      setSurface(nextSurface);
      setAction(nextAction);
      if (nextRun) {
        setCurrentRun(nextRun);
      }
      if (nextGraphMode) {
        onGraphMode(nextGraphMode);
      }
      if (nextRunError) {
        onRunError(nextRunError);
      }
      if (nextAnnouncement) {
        setAnnouncement(
          finishedAnnouncement
            ? `${nextAnnouncement} ${String(
                recordedEventsRef.current,
              )} events recorded.`
            : nextAnnouncement,
        );
      }
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current === null) {
        flushTimerRef.current = window.setTimeout(flush, 100);
      }
    };

    const subscription = agent.subscribe({
      onEvent: ({ event }) => {
        pendingEventsRef.current.push(event);
        scheduleFlush();
      },
    });

    return () => {
      subscription.unsubscribe();
      pendingEventsRef.current = [];
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [agent, threadId, onGraphMode, onRunError]);

  const semanticRows = rows.filter((row) => row.family !== "raw");
  const visibleRows =
    filter === "all"
      ? semanticRows
      : filter === "raw"
        ? rows.filter((row) => row.family === "raw")
        : semanticRows.filter((row) => matchesFilter(row.family, filter));

  const counts = Object.fromEntries(
    FILTERS.map(({ key }) => [
      key,
      key === "all"
        ? semanticRows.length
        : key === "raw"
          ? rows.filter((row) => row.family === "raw").length
          : semanticRows.filter((row) => matchesFilter(row.family, key)).length,
    ]),
  ) as Record<Filter, number>;

  function clearInspector() {
    pendingEventsRef.current = [];
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    rowsRef.current = [];
    surfaceRef.current = EMPTY_SURFACE;
    actionRef.current = null;
    setRows([]);
    setAction(null);
    setSurface(EMPTY_SURFACE);
    setAnnouncement("");
    setFilter("all");
    nextRowId.current = 1;
    recordedEventsRef.current = 0;
    runOpenRef.current = false;
    currentRunRef.current = { threadId };
    setCurrentRun({ threadId });
    toolNames.current.clear();
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">
            AG-UI Inspector
          </h2>
          <p className="text-[11px] text-slate-500">
            Same real run. No extra model request.
          </p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            State = AG-UI run snapshot (status/revision). A2UI = separate
            surface operations (components/data).
          </p>
        </div>
        <button
          type="button"
          className="min-h-8 shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          onClick={clearInspector}
        >
          Clear
        </button>
      </div>

      <div className="min-w-0 break-all border-b border-slate-100 px-3 py-2 font-mono text-[11px] leading-5 text-slate-600">
        <div>thread={threadId}</div>
        <div>
          run={currentRun.runId ?? "n/a"} status=
          {agent.isRunning ? "running" : "idle"}
        </div>
        <div>
          hook state: status={String(agentState?.status ?? "n/a")} revision=
          {String(agentState?.revision ?? "n/a")} mode=
          {String(agentState?.mode ?? "n/a")}
        </div>
      </div>

      <SurfaceInspector surface={surface} />

      <div
        className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2"
        role="group"
        aria-label="Inspector event filters"
      >
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            className={
              filter === key
                ? "rounded-full bg-teal-700 px-2 py-1 text-[11px] font-medium text-white"
                : "rounded-full border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
            }
            onClick={() => setFilter(key)}
          >
            {label} {counts[key]}
          </button>
        ))}
      </div>

      {action ? (
        <div className="border-b border-violet-200 bg-violet-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">
            Forwarded action evidence
          </div>
          <div className="mt-1 text-xs text-violet-950">
            {action.name} on {action.surfaceId}
            {action.sourceComponentId
              ? ` from ${action.sourceComponentId}`
              : ""}
          </div>
          <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-white/80 p-2 font-mono text-[10px] text-violet-950">
            {boundJson(action.context, 600)}
          </pre>
          <div className="mt-1 font-mono text-[10px] text-violet-700">
            captured {action.receivedAt}
            {action.toolCallId ? ` · ${action.toolCallId}` : ""}
          </div>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ol
        className="min-h-0 min-w-0 flex-1 overflow-auto p-2 font-mono text-[11px]"
        aria-label="AG-UI event stream"
      >
        {visibleRows.length === 0 ? (
          <li className="p-2 text-slate-400">
            {rows.length === 0
              ? "Waiting for a run. Use an example or send a prompt."
              : "No events match this filter."}
          </li>
        ) : (
          visibleRows.map((row) => (
            <li
              key={row.id}
              className="mb-1 rounded border border-slate-100 bg-white p-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-slate-400">
                  #{String(row.seq).padStart(3, "0")}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${FAMILY_STYLES[row.family]}`}
                >
                  {row.family}
                </span>
                <span className="min-w-0 truncate font-semibold text-slate-800">
                  {row.type}
                </span>
                {row.repeat > 1 ? (
                  <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                    x{row.repeat}
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                  {row.at}
                </span>
              </div>
              <div className="mt-1 break-all text-[10px] text-slate-500">
                run={shortId(row.runId)} thread={shortId(row.threadId)}
                {row.toolCallId ? ` tool=${shortId(row.toolCallId)}` : ""}
                {row.messageId ? ` msg=${shortId(row.messageId)}` : ""}
                {row.orphan ? " orphan" : ""}
              </div>
              <div className="mt-1 break-words text-slate-700">{row.summary}</div>
              {Object.keys(row.payload).length > 0 ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-teal-700">
                    redacted payload
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[10px] text-slate-700">
                    {boundJson(row.payload)}
                  </pre>
                </details>
              ) : null}
            </li>
          ))
        )}
      </ol>
    </div>
  );
}

function matchesFilter(family: InspectorFamily, filter: Filter): boolean {
  switch (filter) {
    case "state":
      return family === "state";
    case "a2ui":
      return family === "a2ui";
    case "text":
      return family === "text";
    case "tools":
      return family === "tool";
    case "messages":
      return family === "messages";
    case "errors":
      return family === "error";
    case "raw":
      return family === "raw";
    default:
      return true;
  }
}

function timeNow(): string {
  return new Date().toISOString().slice(11, 23);
}

function shortId(value: string | undefined): string {
  return value ? value.slice(0, 8) : "n/a";
}
