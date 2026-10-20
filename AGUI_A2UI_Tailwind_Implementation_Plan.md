# Adaptive Request Builder: Implementation Plan
## AG-UI 1.0 + A2UI v0.9 + React/Vite + Tailwind CSS v4

**Status:** Ready to execute with a mandatory compatibility smoke test; no application has been implemented yet.
**Reference date:** 2026-10-20.
**Authority:** This document supersedes `AGUI_A2UI_Tailwind_Implementation_Plan_base.md`. Follow this document when they differ. Version numbers below are candidate pins verified as published, not a claim that the entire application has already been run.

## 1. Goal and Boundaries

Build a locally runnable proof of concept, not a production request-management system. It must demonstrate three separate capabilities:

1. **AG-UI:** a real SDK-backed agent/browser run with streamed text, run lifecycle events, `STATE_SNAPSHOT` shared state, and a rendered-action round trip.
2. **A2UI:** a live model composes a declarative form from an approved catalog; the browser renders its operations and later updates the **same surface**.
3. **Tailwind:** fixed, trusted application styles; the model never generates CSS, HTML, JSX, or Tailwind class names.

The user can enter any English request or choose these example prompts:

- "I found a login bug. Help me report it." Expect a summary, reproduction details, expected/actual behavior, and severity choice.
- "I want to propose a new dashboard feature." Expect a feature title, user problem, desired outcome, and priority choice.
- "I need to arrange a project review meeting." Expect a topic, agenda, attendees as text, duration choice, and preferred date/time as text.

These are semantic tests, **not** frontend form templates or a category-to-JSX switch. The model must supply the component composition. The UI must also work for a custom request (a reasonable generic form is acceptable).

**Required journey:** start a request; observe streamed agent text and a generated form; edit a bound value; click the form's generated **Review request** button; observe either validation feedback or a review state; ask "Make this a high-priority request and add a short justification"; observe a data change and, if needed, an added component on the existing surface without losing other values; review again if necessary; click a generated **Submit demo request** button; observe "Demo only - nothing was sent." A **New request** control starts a fresh conversation. No tickets, emails, calendars, application-owned database, authentication, deployment, or third-party integrations other than the configured model API; document any local checkpoint files the LangGraph dev server itself needs.

## 2. Chosen Integration and Preflight Pins

Use three **local processes**, not a fictitious in-process LangGraph adapter:

```text
Vite/React browser (CopilotKit v2 provider, registered A2UI renderer, Tailwind)
    | AG-UI requests and streamed responses; Vite proxies /api
    v
Node/Express bridge (CopilotRuntime v2, LangGraphAgent, ONE A2UI middleware)
    | LangGraph server protocol
    v
LangGraph JS dev server (one graph/agent, model, thread state,
                         getA2UITools for model-composed A2UI)
```

`LangGraphAgent` is a client of a running LangGraph server, not the graph itself. The graph owns the draft and conversation history per AG-UI `threadId`; the bridge forwards runs and has no second authoritative draft store. Client-side A2UI binding owns edits until an action sends their resolved values back. Configure `langgraph.json` to load a module exporting a **plain compiled `StateGraph`**; do not configure a custom checkpointer or export a `createAgent`/`ReactAgent` wrapper. The Agent Server injects its own thread checkpoint store; an older wrapper bug could bypass that injection, so Stage 0 must prove that the same thread retains messages and the existing surface. The JS dev server can write local `.langgraph_api` checkpoint files; treat them as framework development state, not an application database.

Use TypeScript with `strict` mode in all three processes. Keep the graph small: a model/tool-call loop and deterministic request/action validation, not a multi-agent workflow (the A2UI generator's internal subagent is part of the supplied toolkit). Declare a LangGraph **`messages` channel with its message reducer** and persist it per thread: `getA2UITools` reads `state.messages` and silently loses prior surface/conversation context if the channel is absent. Keep private validated component data in separate internal channels; expose only safe status/revision fields in the output schema.

| Concern | Candidate exact versions / rule as of 2026-10-20 |
| --- | --- |
| Local tools | Node.js 22.22.2 and npm 10.9.7 are installed; require Node >=22.12 for the chosen Vite toolchain. |
| AG-UI | `@ag-ui/core@1.0.3`, `@ag-ui/client@1.0.3` if directly imported; `@ag-ui/langgraph@0.0.45`; `@ag-ui/a2ui-toolkit@0.0.5`. AG-UI **protocol** 1.0 is distinct from individual package semver. |
| CopilotKit v2 | `@copilotkit/react-core@1.79.1`, `@copilotkit/runtime@1.79.1`, `@copilotkit/a2ui-renderer@1.79.1`; use their `/v2` exports where documented. |
| LangGraph/model | `@langchain/langgraph@1.5.1`, `@langchain/langgraph-cli@1.5.4` (CLI binary: `langgraphjs`), `@langchain/openai@1.6.2`; pin matching core/peer dependencies after install/typecheck. |
| Frontend | `vite@8.3.4`, `@vitejs/plugin-react@6.1.2`, `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`; pin React, TypeScript, and test dependencies after a successful install. |
| A2UI wire | Emit **`version: "v0.9"`** and use one catalog ID end-to-end. The newer v0.9.1 specification also accepts v0.9 messages, but this AG-UI toolkit emits v0.9; do not change its version string or mix renderers. |

Do **not** install standalone `@a2ui/react` or a second `@a2ui/web_core`. Do **not** install/apply a separate `@ag-ui/a2ui-middleware` alongside the CopilotKit runtime's middleware. Runtime 1.79.1 itself pins nested `@ag-ui/core|client@1.0.2`, `@ag-ui/langgraph@0.0.44`, and middleware `0.0.10`, whereas the direct candidate pins above are newer; these nested copies are expected. Record the actually resolved tree in `docs/compatibility.md`, typecheck/run the integration, and do not forcibly deduplicate or override them. Install direct dependencies with exact versions, include a lockfile in the implementation changes, and use `npm ci` thereafter. Never hide peer errors with `--force` or `--legacy-peer-deps`.

The graph explicitly binds the **single** `getA2UITools({ model, catalog, defaultCatalogId, defaultSurfaceId })` tool from `@ag-ui/langgraph` (planner-facing name `generate_a2ui`). Its internal subagent uses `render_a2ui`; do not bind `render_a2ui` yourself. `generate_a2ui` accepts create/update intent; updates target the previous surface. Inspect the installed types when wiring the restricted `catalog` and `guidelines` parameters; do not guess a constructor signature from a different A2UI renderer version.

The browser's `<CopilotKit a2ui={{ catalog }}>` advertises its catalog to the runtime. **Important:** it otherwise causes the runtime to inject an extra `render_a2ui` tool. Keep middleware translation, catalog validation, and action forwarding, but disable **only** that injection:

```ts
import { LangGraphAgent } from '@ag-ui/langgraph';

const runtime = new CopilotRuntime({
  agents: { requestBuilder: new LangGraphAgent({ graphId, deploymentUrl }) },
  runner: new InMemoryAgentRunner(),
  a2ui: { injectA2UITool: false },
});
app.use(createCopilotExpressHandler({
  runtime,
  basePath: '/api/copilotkit',
  mode: 'single-route',
}));
```

Use `CopilotRuntime`/`InMemoryAgentRunner` from `@copilotkit/runtime/v2` and `createCopilotExpressHandler` from `@copilotkit/runtime/v2/express` for the local bridge. Use `CopilotKit` and `CopilotChat` from `@copilotkit/react-core/v2` in the Vite app; the provider takes `runtimeUrl="/api/copilotkit"`, `agent="requestBuilder"`, and `a2ui={{ catalog }}`, and its chat uses `agentId="requestBuilder"`. In the graph bind only `[generateA2UI, ...yourExplicitBusinessTools]`, **not** `state.tools`: the latter can expose an injected raw renderer tool. The upstream `a2ui-tool.ts` docstring shows `[...state.tools, a2ui]`; do **not** copy that line in this catalog-driven runtime setup. Never use `a2ui: { enabled: false }`, which disables the middleware itself. Verify all of this against the installed declarations and the Stage 0 smoke test before building features.

Use one server-side, tool-calling, streaming OpenAI-compatible model, configurable with `MODEL_ID`, `MODEL_BASE_URL`, and `MODEL_API_KEY` in the **agent process**. A provider such as OpenRouter is an option, not an assumed credential or a hardcoded model. A missing key must produce a clear live-mode error; it must never silently switch to fixtures. Set a modest model-output token cap, at most two recovery attempts, and no parallel tool calls. Record latency and token usage when the SDK exposes them, without logging secrets or full prompts.

## 3. Protocol Contract and Ownership

**AG-UI run:** the installed adapter, not custom SSE, must emit `RUN_STARTED`, actual `TEXT_MESSAGE_*` chunks, and `RUN_FINISHED` or `RUN_ERROR`. Preserve `threadId`, new `runId` per run, message/tool-call IDs, and order within a run. The LangGraph adapter emits **`STATE_SNAPSHOT`** from graph state changes and a final graph-state snapshot; do not demand or fabricate `STATE_DELTA` (this TS adapter does not emit it). Put `status`, `revision`, `surfaceId`, and a safe category/summary in declared graph output-state channels so the adapter can include them. Treat A2UI's data model and AG-UI shared state as **different** concepts. A snapshot may also include messages/tools: redact before displaying or saving it.

**A2UI surface:** register one host-owned, restricted catalog on the browser and pass the byte-identical `catalogId` plus schema to graph generation. `catalogId` is an opaque identifier, not a URL that the browser fetches; never let the model select it. The model may choose allowed components, labels, order, options, bindings, and approved variants, but not raw class names, links, images, HTML, scripts, or function-call actions.

Start with just `Text`, `Column`, `Card`, `TextField`, `ChoicePicker` (single selection, `mutuallyExclusive`), and `Button`; add `Row`, `Divider`, or `CheckBox` only if required and validated. Reuse the integrated renderer's supported implementations/schemas, or provide trusted local implementations with strict runtime schemas. If implementing a catalog component locally, its bindable prop schema must accept a literal **or** `{path}` (use the installed SDK's dynamic-value schema), not just `z.string()`. The graph and client must allow exactly the same component subset. Require a flat array with unique IDs, a layout component whose ID is `root`, and a `Text` child referenced by each `Button` for its label.

Keep a **serializable catalog schema and ID** as the shared contract across processes; map its approved definitions to React implementations only in the browser. The forwarded browser catalog is a claim, not server authorization: compare it to the host-approved ID/schema and reject expanded or mismatched component definitions. Do not import React implementations into the graph or assume that a TypeScript interface alone enforces the runtime catalog. Stage 0 must prove that a component rejected by the server schema cannot be painted by the client.

An A2UI operation is a `v0.9` message with **one** of `createSurface`, `updateComponents`, `updateDataModel`, or `deleteSurface`. A generation tool result contains `a2ui_operations`; the runtime middleware publishes these through AG-UI `ACTIVITY_SNAPSHOT` with `activityType: "a2ui-surface"`. Do not mistake a lifecycle activity (`building`/`retrying`/`failed`) for a painted surface. Multiple snapshots can have the same activity `messageId` with `replace: true`: the inspector may log every arrival, but the renderer replaces rather than duplicating the surface. Create each active `surfaceId` once, then reuse it. The A2UI spec permits partial `updateComponents` lists; for deterministic host edits in this PoC, re-emit the validated complete component array unless partial-update behavior has been tested with the installed renderer. Preserve IDs and bindings of unchanged fields. Use path-scoped `updateDataModel` for changed values and errors; overwriting the entire root can erase unsent edits. The toolkit has no `deleteSurface` builder: if deletion is needed, construct and validate the standard `v0.9` `deleteSurface` operation explicitly; a new thread must at least dispose its old rendered view.

**Editable values and actions:** `TextField.value` and `ChoicePicker.value` use `{ "path": "/draft/fieldKey" }` bindings. Changes are initially local to the A2UI data model, **not** an automatic server-side state update. Each generated review/submit `Button` uses an `action.event` with an allowlisted name and an object `context` containing `{path}` entries for **every** rendered editable field plus `/meta/revision`. The renderer resolves these paths at click time. For example, a review action includes:

```json
{"event":{"name":"reviewRequest","context":{"title":{"path":"/draft/title"},"details":{"path":"/draft/details"},"revision":{"path":"/meta/revision"}}}}
```

Include any additional generated field keys in that context; otherwise the server cannot validate or preserve their values. Do not rely on A2UI `sendDataModel` for this integrated path. The browser forwards the A2UI action as AG-UI `forwardedProps.a2uiAction.userAction`; the middleware supplies a synthetic `log_a2ui_event` tool-call/result pair in the graph's message history. A click starts a **new** run on the same thread. Deterministic graph code, not the LLM, parses the action, checks `surfaceId`, source component/action, revision, and field values, then updates state and emits A2UI operations. No separate `/submit` or application-specific action shortcut is allowed.

Do not copy older v0.8 action examples using `action: { name, context: [...] }`. The selected v0.9 catalog uses `action: { event: { name, context: { ... } } }` with an object context as shown above.

**Trace identifiers:** keep `threadId` stable for initial prompt, action, and follow-up; rotate `runId` each run; keep `surfaceId` stable for updates and unique across request instances. Generate the surface ID in trusted graph state per thread; reject a model operation for any other surface or an update that tries to create it again. AG-UI activity `messageId`/tool-call ID is not the A2UI `surfaceId`. **New request** generates new thread and surface IDs, clears visible old UI, and resets inspector filtering. Thread IDs do not provide authentication: bind all three local servers to loopback and do not expose the PoC as a multi-user service.

## 4. Application Data and Validation

Use the smallest deterministic server-side contract; it is **not** an A2UI wire schema:

```ts
type RequestDraft = {
  surfaceId: string;
  revision: number;
  status: 'editing' | 'review' | 'submitted-demo';
  category: 'bug' | 'feature' | 'meeting' | 'other';
  fields: Record<string, string>;
  rules: Record<string, { kind: 'text' | 'choice'; required: boolean; options?: string[] }>;
};
```

Keep choices single-select and values as strings in the initial catalog. Do not add `CheckBox` or multiselect until the draft type, action validation, fixtures, and tests also handle booleans or arrays.

Require two canonical text bindings, `/draft/title` and `/draft/details`, in every generated form; the **model** chooses their request-specific labels (summary/feature title/topic and reproduction/user problem/agenda). Both are server-required. The initial model tree has one **Review request** action and no submit action. On invalid review, deterministic graph code adds/updates a `Text` validation summary **inside the same A2UI surface** through `updateComponents`; a chat-only error is insufficient.

Let the model choose other fields, their order, choices, and layout within the catalog; derive/validate `rules` from that same accepted component tree, **not** from three hardcoded frontend schemas or guesses based on labels. Extra fields may be optional for the first PoC. Initialize **every** bound `/draft` path (empty strings for blank fields) and `/meta/revision` using A2UI data operations so no binding is unresolved; update only affected paths after actions.

Store the bounded, approved component array, field keys/options, and button component IDs/actions in internal graph state so deterministic updates can re-emit a full valid array; expose only a safe summary in AG-UI shared state. Reserve host-only component IDs for validation/submit controls and reject collisions. `category` is informational and must never select a frontend form. Generated `checks` are useful client hints, not server authorization.

Only approved `/draft/<fieldKey>` paths are model-writable. `/meta/revision`, `/meta/status`, and `/errors` are host-owned, read-only to generated inputs, and emitted from deterministic graph code; reject model-generated writes to them before publishing operations. If the chosen progressive generator cannot enforce this before painting, buffer and validate its output before middleware emission instead of claiming an unvalidated stream is safe.

Define and test explicit limits: prompt <=1,000 characters; <=12 fields, <=80 components, <=6 nesting levels, <=8 options per picker, field keys matching `^[a-z][a-z0-9_]{0,31}$`, labels <=100 characters, and field values <=2,000 characters. Reject duplicate keys/IDs, broken child references, unknown catalog components/variants, unexpected data paths/actions, invalid option values, oversized payloads, and model output containing executable or styling content. Apply a small HTTP body limit (for example 64 KiB) and cap tool/recovery attempts. Use SDK/catalog runtime validation **before** rendering; surface a recoverable error if generation fails. Never execute or interpolate model-supplied code.

State transitions:

- `reviewRequest` with blank `title` or `details`, invalid choices, or missing bound values leaves status `editing`; return clear A2UI summary/field errors and agent text, never a success message.
- A valid `reviewRequest` saves the resolved snapshot, increments the server revision, sets status `review`, and updates the same A2UI surface with a generated **Submit demo request** control.
- `submitDemoRequest` requires status `review`, a matching revision, and values unchanged since review. If a field was edited after review, require another review. A successful click sets `submitted-demo` and shows the exact simulation notice; it performs **no** external write.
- A natural-language revision after review returns to `editing`, increments revision, removes/disables the submit control, and patches only changed data/components on the existing surface. For the bug demo, add a priority field (if absent) plus a justification field and set priority to `high`; retain title, details, and other edits. Re-review before submission. After `submitted-demo`, use **New request** instead of reopening the submitted draft.
- Reject stale/double-click actions and unknown actions without mutating the draft. Disable pending UI actions during a run; show a recoverable error rather than replaying a submission automatically.

Use only the Agent Server's local thread storage needed for runs; add no application database or durable request-history feature. Ignore `.langgraph_api` (or the actual dev storage directory reported by the installed CLI), avoid real data, and clean up synthetic demo state using its supported mechanism. No authentication or real submission is in scope. Label the UI: "Demo only; prompts are sent to the configured model provider. Do not enter sensitive or real personal data." Use invented attendee names in meeting examples and redact logs/traces. Keep API keys in the agent process environment, never in Vite `VITE_*` variables, AG-UI state, the catalog, logs, or protocol traces. Only store synthetic example prompts in test fixtures. Fixture mode must be explicit and visibly labeled **FIXTURE - NO LIVE MODEL**.

## 5. Repository Layout and Run Commands

Work in the **existing repository root**; do not create a second `adaptive-request-builder/` root. This is the target responsibility split, not a license to invent framework exports:

```text
package.json, package-lock.json, .gitignore, README.md
apps/agent/       langgraph.json; graph, instructions, A2UI catalog/rules, state, action handling
apps/server/      Express CopilotRuntime v2 bridge; no model key in the browser
apps/web/         Vite/React app, catalog implementations, prompt/chat, surface, inspector, CSS
packages/shared/  small shared catalog ID and safe field-key constants (if needed)
tests/fixtures/   synthetic, protocol-valid AG-UI/A2UI fixture traces
tests/e2e/        browser fixture and opt-in live journeys
docs/compatibility.md, docs/protocol-trace.md
```

Use npm workspaces and add root scripts named `dev:agent`, `dev:server`, `dev:web`, `typecheck`, `test`, `build`, `test:e2e:fixtures`, and `test:e2e:live`. The agent script runs the installed `langgraphjs dev` CLI. Document startup order **agent -> bridge -> web**, graph ID/URL discovered from the running CLI, and the browser URL printed by Vite; the bridge uses `LANGGRAPH_URL`/`LANGGRAPH_GRAPH_ID`. Proxy Vite `/api` to the loopback bridge and use a relative browser `runtimeUrl`; avoid a second client-side transport or unnecessary CORS. Let the integrated CopilotKit chat render A2UI activities in the main pane; do not mount a second independent renderer for the same activity. Put model variables in `apps/agent/.env.example`, and local graph URL/ID in `apps/server/.env.example`; copy each into an ignored `.env` as needed. Never put model secrets in the web app. Add `.env`, `.langgraph_api`, `node_modules`, build output, and test artifacts to `.gitignore` during implementation, **preserving existing rules**; the user chose to keep `/agent-memory` locally ignored.

Tailwind v4 belongs in the web app only: install `tailwindcss` and `@tailwindcss/vite`; use Vite plugins `[react(), tailwindcss()]` and one `@import "tailwindcss";` in the web stylesheet. Use static utility classes in the shell and trusted catalog renderers, with a neutral background, one muted accent, readable form labels/errors and focus rings. Two columns (form/chat + narrow diagnostics) on desktop; one column on narrow screens. Do not use Tailwind v3 directives, generated class strings, a second UI kit, animations, or an elaborate design system. If the integrated renderer has its own styles, keep the shell and supported component overrides scoped; do not break native controls.

## 6. Ordered Implementation Stages

Each stage must pass its exit check before the next. Run `typecheck`, current unit/integration tests, and a web build after each meaningful stage. Prefer a supported API found in installed types and official examples over any illustrative filename or snippet here. If a gate fails, record the exact package/error and **stop for a decision**; do not silently switch to Next.js/Python, fake an A2UI renderer, or replace AG-UI with custom SSE.

### Stage 0 - Compatibility and tiny vertical slice

1. Confirm Node/npm versions; scaffold npm workspaces and the three minimal processes. Install the **candidate exact versions** above and compatible peer packages, with a lockfile. Check installed `/v2` exports, `Catalog` constructor/schema types, `getA2UITools`, `createCopilotExpressHandler`, and `injectA2UITool: false` in **the installed** declarations. Avoid copying examples from a standalone renderer with a different constructor.
2. Register the same restricted catalog ID in browser/graph; mount the v2 bridge; export a plain compiled `StateGraph` with a `messages` channel and run it with the server-managed thread store. Prove that a text prompt produces genuine AG-UI `RUN_STARTED`, multiple `TEXT_MESSAGE_CONTENT` chunks when the model streams, and `RUN_FINISHED`, all on one `threadId`/`runId`. Prove on a second run using that thread ID that prior messages/state are still present and available to `getA2UITools`.
3. Have a deterministic graph tool return an `a2ui_operations` envelope built with `@ag-ui/a2ui-toolkit` (`createSurface`, `updateComponents`, `updateDataModel`) as a real AG-UI tool result. With this tiny fixture (one bound field and one button), prove the middleware translates it to `ACTIVITY_SNAPSHOT`, renders native controls, and forwards a resolved click context via `forwardedProps.a2uiAction.userAction` to graph-side `log_a2ui_event`. Do not emit a hand-written AG-UI activity in place of this integration proof. The graph must have **only** `generate_a2ui` bound for model generation; verify no injected `render_a2ui` is exposed to the planner. Reuse this spike.
4. Change a declared graph state channel and prove a real `STATE_SNAPSHOT` with that key in the AG-UI stream and in the v2 client state hook. Check that it persists across the action run; `STATE_DELTA` is **not** required. Prove one tool-capable live model call (with valid key) before declaring full compatibility.
5. Write `docs/compatibility.md`: installed exact versions, Node/npm, graph/run commands, catalog ID and wire version, example official source links/refs, resolved transitive middleware, smoke-test evidence, and any limitation. If no model key exists, report this gate as **blocked** and ask for credentials; fixture-only tests are not evidence that it passed.

**Exit:** the real stream, one fixture surface/action, actual shared-state snapshot, and live tool-capability check work on pinned dependencies. Otherwise stop and request a technology/credential decision rather than fabricating a substitute.

### Stage 1 - Usable AG-UI shell and inspector

1. Build the prompt input with three example buttons, a custom prompt, a **New request** control, run/error states, and a chat view using the verified v2 provider. Fresh requests rotate thread/surface IDs; actions and follow-ups reuse the thread.
2. Use the v2 `useAgent` state hook (`UseAgentUpdate.OnStateChanged`) and an SDK `agent.subscribe(...)` event observer if the installed version supports them; a dev-only bridge observer is the fallback. Record the **same real run** rather than sending a second request or reconstructing fake events. Display order, event family, run/thread IDs, tool-call IDs, and arrival time. Classify `STATE_SNAPSHOT` separately from A2UI activities. Capture forwarded action evidence without routing actions through the inspector.
3. Provide a collapsed, bounded, redacted JSON view; never expose credentials, full prompts, or unredacted `messages`/`tools` from state snapshots. Handle transport disconnect and visible retry/new-request recovery.

**Exit:** a live text run is streamed in the browser, with a genuine state snapshot and intelligible diagnostics. The inspector does not issue an extra model request.

### Stage 2 - Restricted A2UI fixture pipeline

1. Implement strict runtime schemas for the small catalog and share its exact ID with `getA2UITools`; verify only registered types/actions/paths are accepted. Render protocol-valid fixed fixtures for bug, feature, and meeting through the **actual** integrated renderer, not local JSX forms.
2. Exercise one `createSurface`, `updateComponents` on the same ID, path-scoped `updateDataModel`, and a validated `deleteSurface` fixture operation that actually removes the surface. The live **New request** flow may instead dispose the old thread's renderer through its supported SDK lifecycle; do not claim a `deleteSurface` event unless one was emitted. Confirm an edited bound value is present as a **resolved value**, not a `{path}` object, in the forwarded click context.
3. Add a surface inspector summarizing catalog ID, surface ID, component types/binding paths, activity lifecycle status, and validation errors. Unit-test unknown components, bad child IDs, unknown actions, malformed bindings, and a failed generation that does not paint invalid UI.

**Exit:** the fixture forms are interactive A2UI surfaces and their action round trip works. Label these tests and any fixture-mode UI clearly; they do not prove live model generation.

### Stage 3 - Live model composition

1. Give the model short instructions to stream a brief explanation, then use the registered catalog, two required canonical bindings, action context for **all** generated fields, unique/stable component IDs, per-thread surface ID, and the rule that catalog/version/style are host-owned. Override any toolkit guideline examples that mention `Title` or `Metric`: these are not in the approved catalog and cause avoidable invalid generations. Use `getA2UITools` with the verified custom catalog. The planner calls `generate_a2ui`; its internal `render_a2ui` output is validated by the SDK/middleware, not parsed from arbitrary assistant text.
2. Generate one valid surface from each example and one new custom request **through real model calls**. Compare inspected field bindings, types, counts/order, and semantics; a mere change in random component IDs or labels on identical forms is insufficient. Allow bounded schema recovery and show a clear error if it fails; never substitute fixture forms silently.
3. Record the model tool call, AG-UI activity and catalog-resolved A2UI operations in a sanitized trace. Streaming text is mandatory; early progressive surface paint is a bonus only if the installed adapter actually supplies it.

**Exit:** the three examples yield valid, materially different live model-composed A2UI component trees, and the custom request yields a valid form without a frontend classifier.

### Stage 4 - Deterministic actions, shared state, and updates

1. Save approved field rules and values in graph state. Implement `reviewRequest`/`submitDemoRequest` in deterministic graph code that reads the forwarded synthetic action, validates its full context and revision, and emits the state and same-surface A2UI updates described in Section 4.
2. Have the model interpret the high-priority/justification follow-up; either call `generate_a2ui` with `intent: "update"`, `target_surface_id` set to the saved surface, and bounded `changes`, or return a bounded change intent for a deterministic, validated fixed-schema updater. Do not use a substring switch on the demo prompt. Add each new field to the rendered button's bound action context, or the next review will silently omit it. Emit no second `createSurface`; do not overwrite unrelated `/draft` values. A full `updateComponents` replacement with stable bindings is permitted.
3. Verify two separate threads, stale/double-click actions, bad or missing data, edits after review, a transport failure, and New request reset. AG-UI `STATE_SNAPSHOT` must eventually agree with the server status/revision; A2UI data changes are separately visible in activities.

**Exit:** prompt -> render -> edit -> action -> validation/review -> follow-up -> update -> simulated submit works without reload or external side effects.

### Stage 5 - Tailwind, tests, and handoff

1. Finish static Tailwind styles; check mobile at about 375 px, keyboard tab order, visible labels, focus, error summary, and no horizontal overflow. Do not compromise the renderer for appearance.
2. Add Vitest unit tests for limits, field rules, state transitions, stale revisions, and invalid catalog data; integration tests for real AG-UI event ordering, action forwarding, and state snapshots; fixture/replay browser tests for A2UI rendering and cleanup. Keep a separate, opt-in Playwright **live model** suite for the three examples, one custom request, and the full action/follow-up journey. Never require a paid API key for deterministic CI.
3. Write a short `README.md` with prerequisites, env setup, three startup commands, scripts, fixture-vs-live distinction, troubleshooting, and a 2-3 minute demo. Save one **real, sanitized** end-to-end trace in `docs/protocol-trace.md`; include no invented events or secrets.

**Exit:** checks in Section 7 pass and another developer can run the demo and independently inspect both protocols.

## 7. Acceptance and Evidence

| ID | Check | Observable proof |
| --- | --- | --- |
| A01 | Live prompt and shared state | One successful SDK-backed run shows `RUN_STARTED`, streamed text chunks, `STATE_SNAPSHOT` with a declared request key, and `RUN_FINISHED`; the error path is checked separately in A09. |
| A02 | Model-driven variation | Bug, feature, meeting cause real `generate_a2ui`/internal render tool calls and three semantically different valid field compositions; fixtures/classifier are not substituted. |
| A03 | Real A2UI rendering | `ACTIVITY_SNAPSHOT` with `activityType: "a2ui-surface"` carries `v0.9` `a2ui_operations` whose catalog ID matches the registered renderer; native bound controls appear. |
| A04 | Edit and action | Browser edits change A2UI bound data; click creates a new AG-UI run on the same thread, forwards resolved **all-field** context and matching revision, and reaches graph history as `log_a2ui_event`. |
| A05 | Validation and simulation | Empty required fields cannot review; the backend also rejects a crafted empty action even if client checks disable the button. Valid review followed by submit shows "Demo only - nothing was sent" with no ticket/email/calendar write (model API calls are allowed). |
| A06 | Existing-surface update | Priority/justification revision emits `updateDataModel` and, when needed, `updateComponents` on the **original** surface; unchanged fields retain their values; no repeated `createSurface`. |
| A07 | AG-UI vs. A2UI state | AG-UI `STATE_SNAPSHOT` shows updated status/revision; A2UI data/structure updates appear as separate activity operations; inspector explains the difference. |
| A08 | Invalid payload/action | Unknown catalog component, binding, action, option, or stale revision is rejected safely; no invalid surface or false success is rendered. |
| A09 | Isolation and recovery | Two thread/surface IDs have isolated drafts; mid-run disconnect/timeout is visible and a New request can recover without a silent mode change. |
| A10 | Diagnostics and privacy | Real ordered event/action trace, operation summary, redacted raw JSON, no API key or unredacted user data. |
| A11 | Accessibility and responsive layout | Keyboard-only review/submit and error handling work; mobile view remains usable. |
| A12 | Custom request | A previously unlisted natural-language request yields a valid model-composed form; no category-to-template fallback. |

Deterministic tests may use hand-written or recorded synthetic **AG-UI transport fixtures through the real renderer**, not a mocked A2UI React form. A fixed-schema fixture can test the middleware action bridge without an LLM. Live acceptance is **separate and mandatory for completion**: run the three example prompts and one custom request with a configured tool-capable model, and save a trace showing at least one complete form-edit/action/update cycle. Compare model/tool output to emitted operations semantically, not byte-for-byte (the middleware wraps and validates it). If credentials or the verified adapter path are unavailable, report **blocked/partially verified**, not complete.

## 8. Stop Conditions and References

Stop implementation and ask for a decision if a pinned combination cannot compile, the catalog cannot be enforced, the runtime cannot forward the action, a genuine `STATE_SNAPSHOT` cannot be observed, or the configured model cannot call the generator tool. Do not silently swap frameworks, omit shared state, paint hand-coded React forms, add a direct action endpoint, or claim that fixture playback is live A2UI generation. Keep the app bound to localhost; thread IDs are isolation keys, **not** an access-control mechanism. No production-hardening claim is made.

Official starting points (read the installed package typings if moving `main` branches differ):

- [AG-UI 1.0 events](https://docs.ag-ui.com/spec/1.0/events) and [state](https://docs.ag-ui.com/concepts/state).
- [AG-UI + A2UI integration skill](https://github.com/ag-ui-protocol/ag-ui/blob/main/skills/ag-ui-a2ui-integration/SKILL.md), [runtime and renderer](https://github.com/ag-ui-protocol/ag-ui/blob/main/skills/ag-ui-a2ui-integration/references/a2ui-runtime-and-renderer.md), [framework adapters](https://github.com/ag-ui-protocol/ag-ui/blob/main/skills/ag-ui-a2ui-integration/references/framework-adapters.md), and [verification](https://github.com/ag-ui-protocol/ag-ui/blob/main/skills/ag-ui-a2ui-integration/references/verification.md).
- [AG-UI A2UI toolkit source](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/typescript/packages/a2ui-toolkit/src/index.ts), [LangGraph generator source](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/langgraph/typescript/src/a2ui-tool.ts), and [A2UI middleware source](https://github.com/ag-ui-protocol/ag-ui/tree/main/middlewares/a2ui-middleware).
- [CopilotKit runtime v2 A2UI injection logic](https://github.com/CopilotKit/CopilotKit/blob/main/packages/runtime/src/v2/runtime/handlers/shared/agent-utils.ts) and [CopilotKit A2UI guide](https://docs.copilotkit.ai/generative-ui/a2ui).
- [LangGraphJS Agent Server graph loading/checkpointer injection](https://github.com/langchain-ai/langgraphjs/blob/main/libs/langgraph-api/src/graph/load.mts) and [historical createAgent wrapper checkpoint issue](https://github.com/langchain-ai/langchainjs/issues/10144).
- [A2UI production v0.9.1 specification](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md), [v0.9/v0.9.1 evolution guide](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/evolution_guide.md), and [React renderer reference, not an extra dependency](https://github.com/a2ui-project/a2ui/blob/main/typescript/renderers/react/README.md).
- [Tailwind CSS v4 with Vite](https://tailwindcss.com/docs/installation/using-vite) and [Vite Node requirements](https://vite.dev/guide/).
