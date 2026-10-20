# Stage 3 — Live model composition

Date: 2026-10-20
Status: implementation complete and **live-verified on 2026-10-20** with
OpenRouter `deepseek/deepseek-v4.1-flash-1017`. Fixture results and fake-model
unit tests remain non-live evidence.

## Scope

- `generate_a2ui` composes one form from the shared restricted catalog.
- The planner streams a short explanation, calls the tool once, and ends.
- Per-thread surface IDs are host-owned: streaming draft IDs are never exposed,
  and the final validated surface ID is `surface-${threadId}`.
- A host wrapper validates the final envelope before it reaches the A2UI
  middleware. Invalid output is never painted, and the graph emits a clear chat
  error instead of substituting a fixture form.
- A sanitized live e2e trace records model tool name, operation kinds,
  component types, binding paths, action names, and safe state. It does not
  include prompts, labels, field values, or secrets.

## Model setup (OpenRouter example)

The agent process reads `apps/agent/.env` because `apps/agent/langgraph.json`
declares `"env": ".env"`. The bridge reads `apps/server/.env`. Set live mode in
both places so the UI banner and the actual agent agree.

`apps/agent/.env`:

```bash
AGENT_MODE=live
MODEL_ID=deepseek/deepseek-v4.1-flash-1017
MODEL_BASE_URL=https://openrouter.ai/api/v1
MODEL_API_KEY=sk-or-v1-...
MODEL_MAX_TOKENS=4096
```

`apps/server/.env`:

```bash
AGENT_MODE=live
```

`MODEL_BASE_URL` must be the API root, not the full chat endpoint; ChatOpenAI
appends `/chat/completions`. For OpenRouter the root is
`https://openrouter.ai/api/v1`. `MODEL_MAX_TOKENS` is optional and defaults to
2048; use 4096 when the model spends output tokens on reasoning or generates a
larger form.

The model must be an OpenAI-compatible, streaming chat model that supports
function/tool calling and `tool_choice`. The A2UI generation path relies on
tool-call arguments and strict JSON-like component output; a model without
reliable tool calls will fail host validation with a clear error rather than
paint invalid UI. `deepseek/deepseek-v4.1-flash-1017` was present in the
OpenRouter catalog on 2026-10-20 and advertises `tools`, `tool_choice`, and a
large context window, so it is a reasonable first candidate. If its tool calls
are unreliable, try `deepseek/deepseek-v4-pro` or another tool-capable model.

The live e2e script does not read the `.env` files before its credential gate.
For e2e, export the values in the shell (and stop any fixture bridge already
running):

```bash
export MODEL_ID=deepseek/deepseek-v4.1-flash-1017
export MODEL_BASE_URL=https://openrouter.ai/api/v1
export MODEL_API_KEY=sk-or-v1-...
npm run test:e2e:live
```

## Generation contract

`apps/agent/src/catalog.ts`:

- `getA2UITools` is called with the verified custom catalog and exact
  `catalogId`.
- Custom generation guidelines replace the toolkit defaults. They enumerate
  only `Text`, `Column`, `Card`, `TextField`, `ChoicePicker`, `Button` and
  explicitly forbid `Title`, `Metric`, `List`, `Row`, `Divider`, `Image`,
  `CheckBox`, `Slider`, and `DateTimeInput`.
- `designGuidelines` is set to an empty string, so the toolkit's default design
  examples mentioning incompatible components do not reach the sub-agent.
- Every form must bind `/draft/title` and `/draft/details`, bind every editable
  field to `/draft/<snake_case_key>`, initialize all data values, provide one
  `reviewRequest` action whose context covers every field plus
  `/meta/revision`, and use no submit/discard action in the initial tree.
- The sub-agent is told to include `meta.revision: 0` and
  `meta.status: "editing"` as binding placeholders; the host overwrites these
  host-owned values before publication.
- Recovery is capped at three attempts; attempts are logged only as attempt
  number, success flag, and error codes.

## Per-thread surface and validation

`apps/agent/src/live.ts` wraps the verified generator:

- The tool reads the thread ID from LangGraph config and creates a cached
  generator for a private draft surface ID (`live-draft-surface-<thread>`).
- The final envelope is normalized to the trusted thread surface ID.
- All operations must target one surface and use the shared catalog ID.
- `validateComponentTree` enforces the approved catalog, unique IDs, root
  layout, child resolution, canonical bindings, action allowlist, exact review
  context, host-owned paths, bounded values, and no unsafe markup.
- Exactly one `reviewRequest` button is required; submit, discard, multiple
  review buttons, and function-call actions are rejected.
- The root data model is normalized with host-owned `meta` and `errors`.
  Model-supplied host metadata is overwritten.
- Invalid output returns a `host_error` envelope with no A2UI operations, so
  nothing is painted. SDK recovery exhaustion returns the toolkit error
  envelope.

`apps/server/src/stableActivity.ts` remains outside the A2UI middleware:

- It rewrites every A2UI activity message ID to
  `a2ui-surface-${surfaceId}`.
- In live mode it drops A2UI activities with operations while a
  `generate_a2ui` call is pending, and it drops any operation activity whose
  original surface ID is not the thread surface. The latter is the required
  guard for the inner tool's raw `TOOL_CALL_RESULT`: that result can still be
  emitted with the private draft envelope even though it is wrapped by the host
  tool. The bridge runtime also sets `a2uiToolNames: []`, so the installed
  middleware cannot progressively paint the nested `render_a2ui` stream or
  suppress the final host-validated envelope.
- In live mode it rewrites any remaining activity surface IDs to the thread
  surface as a final safety net.

`apps/agent/src/graph.ts` adds a live `observe` node after the tool:

- A successful validated envelope sets `surfaceId`, `status=editing`,
  `revision=0`, and `mode=live` in graph state.
- A surface mismatch, SDK generation error, or host validation error emits a
  clear chat message. It says no form was painted when no surface exists, and
  says the existing form is unchanged when a surface already exists.
- The graph ends after observation; it does not make a second model call and
  does not loop back to the planner.

## UI and labels

The shell is labeled `Stage 3`, and the live banner states that
`generate_a2ui` composes one form from the shared catalog with host validation
before paint. Fixture mode remains explicitly labeled
`FIXTURE - NO LIVE MODEL`. No fixture form is used as a live fallback.

## Verification

Commands run in this environment:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e:fixtures
LIVE_TRACE_PATH=test-results/live-stage3-trace.json npm run test:e2e:live
```

Current unit/integration status: 82 tests pass across 12 files (33 agent, 22
shared, 16 web, 11 server). The agent suite includes a fake streaming model that
exercises the complete live wrapper: valid normalization to the thread surface,
host metadata overwrite, canonical binding checks, and the invalid-output
cleanup envelope. A server pipeline test runs the real installed
`A2UIMiddleware` over nested `render_a2ui` events and proves both the failure
mode with progressive watching and the fixed final-paint path with
`a2uiToolNames: []`.

Fixture e2e still passes. The live gate passed from a clean start:

- Four real model cases passed: bug, feature, meeting, custom.
- Each case streamed an explanation, called `generate_a2ui`, and produced one
  catalog-validated A2UI activity with the exact operation triple and the
  thread-derived surface ID.
- The example forms had materially different binding paths
  (bug: title/details; feature: priority; meeting: attendees/location/date;
  custom: laptop model).
- Every form had exactly one `reviewRequest` action and no submit/discard.
- State reached live/editing/revision 0 with the activity surface ID.
- The sanitized trace is at `docs/stage-3-trace.json`; a copy is also written to
  `test-results/live-stage3-trace.json` by the e2e command.
- The follow-up guard was exercised by the e2e harness in the bug thread and
  produced no second painted surface.

## Review hardening

The independent review found one critical integration bug: with the installed
middleware watching the nested `render_a2ui` stream, it could mark components
as streamed, then skip the host-validated outer result, leaving no painted form.
The bridge now sets `a2uiToolNames: []`, and a real-middleware pipeline test
covers both the broken and fixed paths.

Additional fixes:

- A thread with an existing surface rejects follow-up model calls
  deterministically; failures preserve the existing `surfaceId`, `revision`,
  and `status` instead of wiping them.
- The wrapper rejects `intent: "update"` in Stage 3 and advertises a create-only
  description.
- Live envelopes must be exactly
  `createSurface, updateComponents, updateDataModel("/")`; extra/scoped data
  operations and non-object components are rejected.
- Live e2e checks that `render_a2ui` is not exposed before `generate_a2ui`
  rather than forbidding the nested sub-agent tool event.
- `docs` and the UI banner state that host validation runs before paint.
- Live model output required bounded host repairs: array-shaped review context
  is keyed from its `{path}` entries, presentation-only props such as
  `placeholder` are dropped, and ChoicePicker variants are forced to the
  plan's single-select contract. Other unknown components/props/actions still
  fail closed.

The independent re-review approved the fixes. Its remaining notes were cosmetic
(stale test name, failure wording, and the loss of middleware building/retrying
lifecycle activities with an empty watch set), and are documented above.

## Known limits for Stage 4

- Only the initial `create` path is normalized; action-time updates and the
  deterministic review/submit flow are Stage 4.
- The live model must include `meta.revision` as a binding placeholder. The host
  overwrites it, but the installed toolkit validates bindings before the host
  normalization step.
- The internal component array and field rules are not yet stored in private
  graph channels; Stage 4 needs them for deterministic re-emission.
- No production authentication or external submission exists.
- With `a2uiToolNames: []`, the installed middleware no longer supplies
  building/retrying lifecycle activities for the nested render stream, and
  nested `render_a2ui` tool-call events may appear in the transcript after the
  planner's `generate_a2ui` call. The A2UI renderer consumes only
  `ACTIVITY_SNAPSHOT`, so the nested events have no paint path; this is a
  cosmetic trace limitation.
- The model is probabilistic: the live run exercised repairs for array-shaped
  action context and `placeholder`; a different prompt can still be rejected
  by the strict host contract. Rejections are clear and never paint.
