# Stage 4 — Deterministic actions, shared state, and updates

Stage 4 turns the Stage 3 live surface into a stateful request flow. The model
still composes the first form and interprets revision requests, but review,
submission, stale-action rejection, and bounded form changes are deterministic
host code. No external ticket, email, or calendar is created.

## Checkpoint-anchored state

`apps/agent/src/state.ts` keeps two kinds of state:

- public channels (`status`, `revision`, `surfaceId`, `category`, `summary`,
  `mode`) that are exposed in `STATE_SNAPSHOT`;
- a private `surface` channel (`apps/agent/src/request.ts`) with the stored
  component tree, field specs, resolved values, review snapshot, and
  authoritative revision.

The graph declares `RequestInputSchema` with only `messages` and
`RequestOutputSchema` with only the public fields. The LangGraph API exposes
those as `input_schema`/`output_schema`; the AG-UI adapter filters client input
and `STATE_SNAPSHOT` accordingly.

Consequences:

- a client cannot merge a forged `revision`, `status`, `components`, or draft
  value into the checkpoint;
- the inspector sees `status`, `revision`, `surfaceId`, and `mode`, but not the
  component tree, field rules, values, or review snapshot;
- action code reads `state.surface`, never `state.revision`, so stale actions
  are rejected against the saved revision.

## Deterministic actions

The live graph routes `START` to `action` when the last message is a forwarded
`log_a2ui_event` tool result; otherwise it goes to the model planner.

`apps/agent/src/request.ts` implements:

- `applyReviewAction`: validates revision, exact context keys, required fields,
  and approved choice values. A valid review saves the values, increments the
  revision, keeps the same surface, adds the host-owned
  `submitDemoRequest` control, and emits path-scoped `/errors`,
  `/meta/status`, and `/meta/revision` updates. An invalid review paints the
  validation summary inside the same surface and does not advance the revision.
- `applySubmitAction`: requires `status: "review"`, the reviewed revision, and
  values unchanged since review. A matching submit sets `submitted-demo`,
  removes actionable buttons, and displays the exact notice
  `Demo only - nothing was sent.`. Changed values return the surface to
  editing, remove submit, and require another review.
- `normalizeChangePlan` / `applyChangePlan`: validate a bounded change intent
  (at most four added fields, eight changed values, twelve fields total,
  approved choice options) and apply it to the same surface. Only new/changed
  `/draft/*` paths are written, so unrelated values and unsent edits are
  preserved. The review button context is regenerated with every field.

The host builds `submit` and status/validation components; model output may not
use those reserved IDs. The action context for both review and submit contains
every editable field plus `/meta/revision`.

## Model follow-ups

The live planner binds two tools:

- `generate_a2ui` (create-only, one surface per thread);
- `apply_request_changes` (structured `add_fields` / `set_values` intent).

The model interprets the follow-up prompt and returns a change plan. The host
validates and applies it deterministically. There is no substring switch on
demo prompts in application code. After a follow-up, the surface returns to
editing, the revision increments, and submit is removed until another review.

## Plumbing

Actions publish host-validated operations through the internal
`publish_request_operations` tool; the A2UI middleware paints the tool result.
After the middleware has consumed an envelope, the graph replaces the
tool-call arguments and result in checkpoint messages with a compact
acknowledgement. The injected `log_a2ui_event` pair is compacted too, after
the action has been parsed and validated, so repeated clicks do not retain
resolved field values in history. This keeps request bodies below the bridge's
64 KiB limit while leaving the activity and rendered surface intact. The action
node emits a one-shot `a2ui_action_evidence` custom event before publishing;
the inspector renders that event, so forwarded-action evidence keeps the
resolved values without persisting them in message history.

## Verification

- `apps/agent/src/request.test.ts` covers stale review, unknown context keys,
  invalid required fields, valid review, submit before review, exact submit
  notice, double submit, edits after review, change-plan bounds, value
  preservation, updates after submit, and re-review.
- `tests/e2e/live.mjs` runs the full live journey: invalid review, valid
  review, natural-language high-priority + justification update, stale review,
  re-review, changed-after-review submit, re-review, submit, and double submit.
  It also asserts that `STATE_SNAPSHOT` never contains `surface`, `components`,
  `fields`, `values`, `draft`, `reviewedValues`, or `reviewedRevision`, and
  that no action creates a second surface.
- Browser check with Playwright: rendered form, review, model update adding
  priority/justification while preserving existing values, re-review, submit,
  exact demo notice, and New request reset to a fresh thread with no events.

The fixture path remains deterministic and separate; it does not claim the
Stage 4 live update flow.
