# Adaptive Request Builder

A local demo of the AG-UI 1.0 and A2UI v0.9 protocols. A LangGraph planner
composes a catalog-validated request form, the form edits its own A2UI data,
and a deterministic host flow reviews and simulates submission. No ticket,
email, or calendar is created.

> This is a localhost demo, not a production service. Thread IDs isolate
> drafts but are not access control. Keep the app bound to localhost.

## Architecture

Three local processes:

1. `apps/agent` — LangGraph dev server on `127.0.0.1:2024`, graph
   `requestBuilder`. It owns the model, catalog rules, private request state,
   review/submit transitions, and bounded follow-up changes.
2. `apps/server` — Express CopilotKit runtime on `127.0.0.1:4000`. It bridges
   the browser to LangGraph, registers the A2UI middleware, and enforces a
   64 KiB request-body cap.
3. `apps/web` — Vite/React UI on `127.0.0.1:5173`. It renders the A2UI form
   through the installed renderer and includes a redacted AG-UI/A2UI inspector.

AG-UI carries runs, text, tools, messages, and public state. A2UI carries
surface operations and bound field data. The form is rendered by the catalog
renderer, never by hand-written JSX for a category.

## Prerequisites

- Node.js `>=22.12` (verified with Node 22.22.2 and npm 10.9.7)
- A Chromium browser for the optional Playwright suites:
  `npx playwright install chromium`
- For live mode only: a tool-capable OpenAI-compatible model endpoint. The
  verified setup is OpenRouter `deepseek/deepseek-v4.1-flash-1017` with
  `MODEL_BASE_URL=https://openrouter.ai/api/v1` and `MODEL_MAX_TOKENS=4096`.

## Setup

```bash
npm install
cp apps/agent/.env.example apps/agent/.env
cp apps/server/.env.example apps/server/.env
```

Both files default to deterministic fixture mode. Keep `AGENT_MODE` identical
in the agent and server files; the server reports the mode used by the UI
banner.

### Live mode

Edit the two local `.env` files (never commit them):

```dotenv
# apps/agent/.env
AGENT_MODE=live
MODEL_ID=deepseek/deepseek-v4.1-flash-1017
MODEL_BASE_URL=https://openrouter.ai/api/v1
MODEL_API_KEY=sk-or-...
MODEL_MAX_TOKENS=4096
```

```dotenv
# apps/server/.env
AGENT_MODE=live
```

Fixture mode makes no model request and is visibly labeled
`FIXTURE - NO LIVE MODEL`. It is suitable for deterministic tests, but it is
not live-generation evidence.

## Run the demo

Open three terminals in the repository root:

```bash
npm run dev:agent
```

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Open <http://127.0.0.1:5173>. If a port is occupied, stop the old process
before starting another; the bridge and agent cannot switch modes in place.

### 2–3 minute fixture walkthrough

1. Click **Login bug**. A catalog-rendered form appears; the mode badge says
   `FIXTURE` and the composer text says no model was called.
2. Edit **Bug summary** and **Steps to reproduce**, choose a severity, and
   press **Review request**. The same surface shows `Reviewed at revision 1.`
   The inspector shows the forwarded action context and the same-surface A2UI
   update.
3. Optionally click **New request** to clear the surface and start a fresh
   thread. **Discard demo form** is also available in fixture mode for a
   protocol-only cleanup check.
4. Inspect **AG-UI vs A2UI state**: public `STATE_SNAPSHOT` fields are in the
   State filter; `createSurface`, `updateComponents`, and `updateDataModel`
   operations are in the A2UI filter.

### Live action/update walkthrough

1. With live mode configured, click **Login bug** and wait for the streamed
   explanation and generated form.
2. Fill the fields, click **Review request**, and wait for the review
   confirmation.
3. Send a follow-up such as
   `Make this a high-priority request and add a short justification. Keep the existing fields.`
   The model calls `apply_request_changes`; the host validates and applies the
   plan to the same surface at the next revision.
4. Review again and click **Submit demo request**. The UI displays
   `Demo only - nothing was sent.` and removes the action.
5. Use **New request** to start a clean thread.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check all workspaces. |
| `npm test` | Vitest unit/integration suites in all workspaces. |
| `npm run build` | Production build of the web app. |
| `npm run test:e2e:fixtures` | Deterministic AG-UI/A2UI transport e2e; starts agent and bridge if absent. |
| `npm run test:e2e:browser` | Deterministic Playwright fixture UI suite; starts all three services. Stop dev servers first. |
| `npm run test:e2e:live` | Opt-in live protocol gate; requires model credentials. This is the mandatory live acceptance run. |
| `npm run test:e2e:browser:live` | Opt-in live Playwright journey; loads `apps/agent/.env` and requires credentials. |
| `npm run check:trace` | Verify the sanitized protocol trace contains the required sections and no known secrets/user values. |
| `npm run generate:catalog-schema` | Regenerate the shared catalog schema from the installed renderer. |

The deterministic commands must run without any model API key. Live commands
exit with status 2 when credentials are missing. Live output is probabilistic;
a rejected initial form is a model-side failure that the UI exposes through
Retry, not a fixture fallback.

To regenerate the sanitized trace from a real live protocol run:

```bash
set -a; . apps/agent/.env; set +a
PROTOCOL_TRACE_PATH=docs/protocol-trace.md npm run test:e2e:live
npm run check:trace
```

## Fixture vs live

| | Fixture | Live |
| --- | --- | --- |
| Model request | No | Yes, tool-capable planner |
| Surface source | Fixed validated definitions | `generate_a2ui` result, host-validated |
| Deterministic | Yes | No; rerun on model rejection |
| Credentials | None | `MODEL_ID` and `MODEL_API_KEY` |
| Evidence | Protocol/UI regression only | Real composition, streaming, and follow-up acceptance |
| Follow-up changes | No model follow-up; review/discard only | Bounded `apply_request_changes` plan |

Both modes share the catalog, strict operation validation, host-owned review
logic where applicable, and the same React renderer.

## Troubleshooting

- **Port already in use** — stop the process on `2024`, `4000`, or `5173`.
  Playwright configs use `reuseExistingServer: false`, so stop manual dev
  servers before `test:e2e:browser`.
- **Bridge unavailable / `MODE UNKNOWN`** — check `npm run dev:server`, then
  `curl http://127.0.0.1:4000/api/health`. The UI polls every 5 s and offers
  Reconnect after recovery.
- **Mode mismatch** — set the same `AGENT_MODE` in both `.env` files. A live
  bridge talking to a fixture agent will fail its startup health assertion.
- **`A2UI generation failed`** — the model output was rejected or the model
  omitted a required field. Use a tool-capable model, allow more output tokens
  (`MODEL_MAX_TOKENS=4096`), and retry. The app does not fall back to fixtures.
- **Live suite blocked** — export `MODEL_ID` and `MODEL_API_KEY`, or put them
  in the ignored `apps/agent/.env`. `test:e2e:browser:live` loads that file.
- **Playwright browser missing** — run `npx playwright install chromium`.
- **Thread/surface confusion** — a new request clears messages, agent state,
  and the A2UI surface before starting a new thread. Old thread IDs are not
  reused.

## Evidence and limits

- `docs/protocol-trace.md` — real, sanitized AG-UI event order and A2UI
  operation summaries from a live run, including the form-edit/action/update
  cycle.
- `docs/compatibility.md` — pinned versions, verified adapter/middleware
  behavior, and Stage 0 traps.
- `docs/stage-1.md` … `docs/stage-5.md` — stage evidence and review outcomes.

Known limits: no authentication or multi-user isolation, no persistent
production store, no external submission, and no real-time collaboration.
Model calls are allowed; submission is simulation-only.
