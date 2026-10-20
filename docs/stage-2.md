# Stage 2 — Restricted A2UI fixture pipeline

Date: 2026-10-20
Status: implemented and verified in fixture mode. This stage does **not** prove
live model generation; all forms are fixed fixtures.

## Scope

- Three fixed, semantic forms: bug report, feature proposal, and project review
  meeting, plus a minimal generic fallback. Each is emitted as A2UI v0.9
  operations and rendered by the integrated CopilotKit A2UI renderer. No local
  JSX form is used.
- Strict host-side validation runs before any fixture envelope reaches the
  middleware or renderer.
- The same surface supports `createSurface`, `updateComponents`,
  path-scoped `updateDataModel`, and a validated `deleteSurface`.
- The fixture-only **Discard demo form** control exercises `deleteSurface`; it
  is visibly fixture mode, not a production submit flow.
- A surface inspector summarizes catalog ID, surface ID, activity message ID,
  lifecycle status, component types, binding paths, and validation errors.

## Strict catalog contract

Catalog ID: `arb://catalog/request-builder.v1`.

Allowed components: `Text`, `Column`, `Card`, `TextField`, `ChoicePicker`,
`Button`.

Allowed actions: `reviewRequest`, `discardSurface`.

Allowed data paths:

- `/draft/<fieldKey>` for editable fields;
- host-owned `/meta/revision`, `/meta/status`, `/errors`, `/errors/summary`,
  `/errors/fields/<fieldKey>`.

`packages/shared/src/operations.ts` adds runtime rules on top of the generated
catalog schema and the SDK toolkit validator:

- unknown components and unknown component properties are rejected;
- duplicate/missing IDs, unresolved child IDs, child cycles, unreachable nodes,
  and excessive depth are rejected;
- Button children must reference `Text`; Button `functionCall` actions are
  rejected;
- action names and action-context keys are allowlisted; review context must
  contain a `{path}` entry for every bound editable field plus
  `/meta/revision`;
- bindings must use approved paths, and malformed `{path}` objects are
  rejected;
- text/labels/options are bounded and reject markup, script URLs, `style=`,
  and `class=`;
- `ChoicePicker` must be `mutuallyExclusive`; the installed renderer stores an
  array, so server validation accepts a single-item string array and
  normalizes it;
- every operation envelope must use `version: "v0.9"`, one operation key per
  entry, the shared catalog ID, and one surface ID.

The agent validates fixed fixtures with both the shared strict validator and
`validateA2UIComponents` from `@ag-ui/a2ui-toolkit` before publishing them.

## Fixture behavior

| Prompt | Fixture | Distinct fields |
| --- | --- | --- |
| login bug / error / crash | bug | expected, actual, severity |
| dashboard feature / propose | feature | outcome, priority |
| meeting / schedule / agenda | meeting | attendees, duration, preferred_time |
| anything else | generic | title, details |

All fixtures bind canonical `/draft/title` and `/draft/details`, include a
Review request action with every bound field in its context, and include the
fixture-only discard action.

Review action:

- Invalid required values produce `updateComponents` plus path-scoped
  `updateDataModel` for `/errors` and `/meta/status`. The surface remains
  editable, the revision does not advance, and no invalid components are
  emitted.
- Valid values produce `updateComponents` on the same surface plus
  path-scoped `/errors`, `/meta/status`, and `/meta/revision`. The graph state
  advances to `review` and `revision + 1`.
- Unknown context keys and stale revisions are rejected without publishing
  operations.

Discard action:

- Requires exactly the resolved `revision` binding and matching context;
- emits one `deleteSurface` operation for the active surface;
- graph state clears `surfaceId` and resets revision.

## Renderer lifecycle

The installed CopilotKit activity renderer mounts a separate `A2UIProvider`
for each activity message. A new activity message with a different ID cannot
update the provider owned by the original surface.

The bridge therefore registers `stableA2UIActivityMiddleware` on the
`LangGraphAgent` before the runtime attaches its A2UI middleware. The bridge
middleware runs outside the A2UI middleware and rewrites every
`a2ui-surface` `ACTIVITY_SNAPSHOT` message ID to
`a2ui-surface-${surfaceId}`. The content remains a replace snapshot, so the
same chat host/provider receives the update operations and applies them to the
existing surface. Tool-call IDs remain unique, so the LangGraph adapter still
emits tool events and the A2UI middleware still produces an activity for each
action.

This is what makes `updateComponents` and `deleteSurface` work in the
integrated renderer rather than only in protocol tests.

## Inspector

`apps/web/src/surface.ts` reduces A2UI activity snapshots into a bounded
summary:

- catalog ID, surface ID, activity message ID;
- lifecycle: `none`, `building`, `retrying`, `failed`, `painted`, `deleted`;
- operation kinds;
- component types and count;
- binding paths (draft fields, revision, and host validation path);
- schema validation errors plus lifecycle errors.

The panel never displays user-entered values. It is updated by the existing
single inspector subscription.

## Verification

Commands:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e:fixtures
```

Unit coverage includes:

- accept a valid fixture tree and initialize every bound value;
- unknown component, bad child ID, unknown action, malformed binding, missing
  review context, wrong catalog ID;
- path-scoped revision type validation;
- root data validation even when no component-derived fields are known;
- bounded/sanitized `/errors` payloads and host-only ID type collisions;
- operations after `deleteSurface` are rejected;
- unsafe markup, duplicate IDs, cycles, and unreachable components;
- `deleteSurface` envelope validation;
- fixture selection, per-fixture fields, full review context, same-surface
  valid review, in-surface invalid review, discard, unknown context keys;
- a corrupted generation envelope is blocked before publication;
- surface inspector create/update/delete lifecycle, stable activity ID across
  lifecycle-only snapshots, and validation errors.

`npm run test:e2e:fixtures` verifies through the real bridge protocol:

- all four fixed fixtures render the expected distinct fields;
- create emits `createSurface`, `updateComponents`, and `updateDataModel` with
  the shared catalog ID;
- each thread gets a distinct surface ID and one stable activity message ID;
- valid review emits only same-surface `updateComponents` and path-scoped
  `updateDataModel`, and the checkpoint retains resolved field values (not
  `{path}` objects);
- invalid review emits an in-surface validation update without advancing the
  revision;
- discard emits exactly one validated `deleteSurface`;
- stale review is rejected without painting or mutating state.

Manual Playwright check on the integrated renderer confirmed:

- the bug fixture rendered in chat with native fields and the surface
  inspector showing catalog/surface/activity IDs, types, and bindings;
- editing bound fields and selecting `High` forwarded resolved values
  (`"Login fails on Safari"`, `["high"]`) to the graph;
- valid review updated the same surface to `Report a bug (fixture review)` and
  `Reviewed at revision 1.`;
- discard removed the form and the inspector reported `deleted`;
- a blank feature review painted `Please fix: Feature title is required...`
  inside the same surface while keeping revision 0.

## Review hardening

The independent review approved the stage and identified latent strictness
gaps. The following were fixed:

- root `updateDataModel` now validates structure and values even without
  component-derived field rules;
- `/errors` updates are shape-checked, content-checked, and capped at 4000
  serialized characters;
- host-only component IDs are type-enforced (`root`, `heading`, `intro`,
  `review`, `discard`, labels, validation/status);
- no operation may follow `deleteSurface` in the same envelope;
- field derivation no longer uses module-level mutable state;
- lifecycle-only activities keep the stable surface activity ID in the
  inspector;
- tests were added for unsafe markup, duplicate IDs, cycles, unreachable
  nodes, host-ID collisions, oversized/unsafe error data, root-data fallback,
  and delete ordering.

## Deliberate limits

- Fixtures are fixed; they are not evidence of live model tool selection or
  streaming.
- The generic fallback is still fixture output, not generated UI.
- `deleteSurface` is a fixture lifecycle exercise; the live New request flow
  may dispose the renderer through SDK lifecycle instead and must not claim a
  `deleteSurface` event unless one is emitted.
- Stage 4 still owns checkpoint-anchored authoritative revision, the real
  submit flow, and full duplicate/stale action hardening.
- Stage 3 must align the strict root-data fallback with the live generated data
  model shape. The current validator intentionally rejects unknown top-level
  keys, so generic middleware `{items: ...}` root updates would be reported by
  the inspector until Stage 3 defines the live data contract.
