# Stage 1 — usable AG-UI shell and inspector

Date: 2026-10-20
Status: implemented; fixture evidence passes. The live text-run exit gate remains
BLOCKED because this environment has no `MODEL_ID` or `MODEL_API_KEY`.

## Implemented shell

- Three example buttons (`Login bug`, `Dashboard feature`, `Project review
  meeting`) above the chat, visible on a fresh thread and after New request.
  They add a real user message and call `copilotkit.runAgent({ agent })` once.
- Custom prompt through the verified CopilotKit v2 chat input.
- `New request` calls `agent.setMessages([])`, `agent.setState({})`, and
  `startNewThread()`. Clearing the agent is required because `startNewThread`
  alone changes the thread ID but leaves the old chat and A2UI surface visible.
- Fresh requests get a new thread ID; the graph derives a new surface ID from
  the thread ID. Actions and follow-ups reuse the current thread.
- Run/error states: `RUNNING`, `ERROR`, `IDLE` pill; a transport/run error
  banner with `Retry last run`, `New request`, and `Dismiss`. Pending buttons
  are disabled while a run is active.
- Retry reuses the agent's current messages; it does not add a duplicate user
  message. A transport failure can take the LangGraph SDK timeout before the
  error appears; recovery was verified by stopping the agent, failing a run,
  restarting the agent, and clicking Retry.
- The integrated `CopilotChat` renders the A2UI activity. There is no second
  independent renderer. The built-in CopilotKit Inspector is disabled.

## Inspector

- Uses `useAgent` with `OnStateChanged`, `OnRunStatusChanged`, and
  `OnMessagesChanged` plus a single `agent.subscribe({ onEvent })`. It does not
  send a request and does not reconstruct events.
- Rows show sequence, arrival time, family badge, event type, run/thread IDs,
  tool-call IDs, message IDs, and a short summary.
- Families: `run`, `text`, `tool`, `state`, `messages`, `a2ui`, `activity`,
  `error`, `raw`, `other`. Filters: All, State, A2UI, Text, Tools, Messages,
  Errors, Raw.
- `STATE_SNAPSHOT` and A2UI activities are separate families and separate
  filters. Consecutive duplicate state snapshots are merged with an `xN` count.
  Raw transport events are disabled at the bridge (`emitRawEvents: false`) and
  kept behind the Raw filter if a future source emits them.
- Every payload is collapsed behind `redacted payload`, bounded to 200 rows and
  2000 JSON characters. State payloads contain only status, revision,
  surfaceId, category, summary, and mode. Message snapshots contain only count
  and roles. Text/args/results contain only lengths plus non-user metadata
  (tool name, action name, surface ID, source component). A2UI activities
  contain only operation kinds and surface IDs. A tool result that merely looks
  like an action but has no matching `log_a2ui_event` tool call is rejected as
  evidence.
- Forwarded action evidence is captured from `MESSAGES_SNAPSHOT` only when a
  tool result's `toolCallId` matches an assistant tool call named
  `log_a2ui_event`. The card shows action name, surface ID, source component,
  and resolved context. This is user-entered evidence; the safe state `summary`
  field may also contain user-entered text (for example a title), capped at 160
  characters. The action is not routed through the inspector.
- On thread change, rows, action evidence, filter, tool-name cache, and cursor
  are reset.

## Verified evidence

- `npm run typecheck` — all workspaces pass.
- `npm test` — 20 tests pass:
  - agent: 4 (fixture validation and action parsing);
  - shared: 6 (catalog contract and forwarded action parser);
  - web: 10 (redaction, families, action evidence provenance, bounds,
    browser catalog).
- `npm run build` — passes; Vite reports existing large-chunk warnings from the
  SDK/renderer bundles.
- `npm run test:e2e:fixtures` — PASS, including text, tool result, activity,
  state, action round trip, same surface, checkpoint retention, and the paired
  `log_a2ui_event` tool call/result.
- Manual browser checks with the Playwright MCP tool (not a committed
  Playwright suite; Stage 5 adds the repeatable journey):
  - three examples visible on a fresh thread; example run produced a real
    `agent/run` and the fixture surface;
  - custom prompt run produced the surface and inspector events;
  - click forwarded `Login fails on Safari`; the inspector showed the action
    evidence card and the graph state advanced to `status=review`, `revision=1`;
  - inspector showed `All 28`, `State 8`, `A2UI 1`, `Text 6`, `Tools 4`,
    `Messages 1`, `Errors 0`, `Raw 0` for one fixture run;
  - opening a state payload showed only
    `{ status, revision, category, summary, mode }`, no messages/tools/prompts;
  - New request created a new thread, cleared the chat surface and inspector,
    reset the filter, and restored the examples;
  - stopping the agent produced a visible error banner and `ERROR` state;
    restarting the agent and clicking Retry produced a new surface and `IDLE`;
  - stopping the bridge produced `MODE UNKNOWN`, `ERROR`, and a
    Bridge unavailable/Reconnect banner; when the bridge returned, the 5 s
    health poll remounted the CopilotKit provider, restored `FIXTURE`/`IDLE`,
    re-enabled the chat, and rotated to a fresh thread.
- No-extra-model-request check: one page load produced `{"method":"info"}` plus
  one `{"method":"agent/run"}` for the example. The inspector is
  subscription-only; the 5 s `/api/health` poll is a bridge probe, not a model
  request.
- `npm run test:e2e:live` — **BLOCKED**, exit 2. No live text streaming in the
  browser can be claimed until `MODEL_ID` and `MODEL_API_KEY` are provided.

## Compatibility notes

- The LangGraph dev script now uses `--no-browser` so it never opens LangSmith
  Studio. `LANGSMITH_API_KEY` is not needed for this demo.
- `LangGraphAgent` is configured with `emitRawEvents: false`; the AG-UI typed
  events and metadata remain. This removes the repeated RAW mirror events from
  the inspector.
- The adapter emits `RUN_FINISHED` with a run ID different from `RUN_STARTED`.
  The inspector displays the event ID and appends
  `(event run ID differs from started ...)` instead of hiding it.
- The A2UI middleware injects `log_a2ui_event` messages into the next graph run,
  but the synthetic tool call/result is not re-emitted as AG-UI tool events.
  Action evidence therefore comes from the message snapshot.
- Example buttons do not use the suggestions engine, so they cannot trigger a
  suggestion-generation model request.
- The Stage 1 exit's live-model streaming requirement is not proven in fixture
  mode. Fixture text has one content chunk per message; only a real provider can
  prove multi-chunk streaming.
- A run started from the chat input clears the previous error banner through the
  `agent.isRunning` transition, not only through Retry/New request/example.
- The bridge is probed every 5 s. A bridge outage shows `MODE UNKNOWN`, an
  `ERROR` pill, and a Bridge unavailable/Reconnect banner. When health recovers,
  the provider is remounted with a new `runtimeEpoch`, re-fetching runtime info
  and re-enabling the chat. This rotates to a new thread; the old thread's
  visible messages are not restored. If a run is still active when health
  recovers, the remount is deferred until the run ends (the run-end transition
  retries it). Reconnect uses the same path. The built-in
  CopilotKit dev console is disabled with `showDevConsole={false}`.
- Events that arrive outside an open run are flagged `orphan` rather than
  silently attributed to the current thread.
- The inspector's event list is not an `aria-live` region; a hidden polite
  status region announces the event count and latest summary instead.
- Stage 4 must locate the last `log_a2ui_event` tool result, not only
  `messages.at(-1)`, when deterministic action handling moves into the live
  graph.
- The 64 KiB bridge limit relies on a required, truthful `Content-Length`;
  Node's HTTP parser enforces the declared length. A future raw-body counter
  can remove that trust assumption if needed.

## Commands

```bash
npm run dev:agent   # --no-browser, no Studio tab
npm run dev:server
npm run dev:web
npm run typecheck
npm test
npm run build
npm run test:e2e:fixtures
MODEL_ID=... MODEL_API_KEY=... npm run test:e2e:live
```
