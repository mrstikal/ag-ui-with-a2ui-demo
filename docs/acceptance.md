# Acceptance and evidence

Date: 2026-10-21
Scope: Section 7 of `AGUI_A2UI_Tailwind_Implementation_Plan.md`.
Environment: Node.js 22.22.2, npm 10.9.7, localhost-only demo.
Live model: OpenRouter `deepseek/deepseek-v4.1-flash-1017`
(`MODEL_BASE_URL=https://openrouter.ai/api/v1`, `MODEL_MAX_TOKENS=4096`).

Deterministic evidence and live evidence are kept separate. Fixture playback is
not presented as live model generation, and no live run is replaced by a
fixture fallback.

## Result

All twelve acceptance checks pass.

| ID | Check | Evidence | Result |
| --- | --- | --- | --- |
| A01 | Live prompt and shared state | `tests/e2e/live.mjs` asserts `RUN_STARTED`, at least two `TEXT_MESSAGE_CONTENT` chunks, `STATE_SNAPSHOT` with public `status`/`revision`/`surfaceId`/`mode`, and `RUN_FINISHED`. The sanitized order is in `docs/protocol-trace.md` (initial bug generation). | PASS |
| A02 | Model-driven variation | `tests/e2e/live.mjs` asserts real `generate_a2ui` calls, the nested `render_a2ui` tool, and materially different forms for bug, feature, meeting, and custom prompts. The trace records the generator call and nested render calls. | PASS |
| A03 | Real A2UI rendering | Live and fixture runs emit `ACTIVITY_SNAPSHOT` with `activityType: "a2ui-surface"` and `v0.9` operations whose catalog ID is `arb://catalog/request-builder.v1`. Playwright renders native bound inputs/buttons through the installed renderer. | PASS |
| A04 | Edit and action | `tests/browser/fixture.spec.ts` edits fields and activates **Review request**; `tests/e2e/fixtures.mjs` checks the resolved all-field context plus `/meta/revision` and the graph-side `log_a2ui_event` pair. The action run reuses the thread and creates a new run ID. | PASS |
| A05 | Validation and simulation | Empty or crafted-invalid review is rejected by the deterministic graph without painting a false success; valid review followed by submit shows exactly `Demo only - nothing was sent.` and performs no external write. Covered by `tests/e2e/live.mjs`, `tests/browser/live.spec.ts`, and `apps/agent/src/request.test.ts`. | PASS |
| A06 | Existing-surface update | The follow-up path calls `apply_request_changes`, emits `updateDataModel`/`updateComponents` on the original `surface-${threadId}`, adds priority and justification, preserves title/details, and emits no second `createSurface`. Covered by the Stage 4 journey in `tests/e2e/live.mjs`. | PASS |
| A07 | AG-UI vs. A2UI state | The inspector separates State and A2UI filters, shows public AG-UI state separately from A2UI operation summaries, and explains the distinction in the UI (`apps/web/src/Inspector.tsx`). Unit tests cover the reduction and redaction. | PASS |
| A08 | Invalid payload/action | `packages/shared/src/operations.test.ts` and `apps/agent/src/request.test.ts` reject unknown components, bindings, actions, options, host paths, and stale revisions. `tests/e2e/fixtures.mjs` adds cross-thread and unknown-action rejection without painting. | PASS |
| A09 | Isolation and recovery | Fixture e2e starts two threads, reviews one, verifies the other stays `editing/0`, rejects a cross-thread action, and rejects an unknown action. Live e2e verifies the bug thread ends `submitted-demo/6` while the feature thread stays `editing/0` with no leaked values. A browser test returns HTTP 502 from the bridge, shows the error banner while mode stays `FIXTURE`, and recovers with **New request**. Stage 1 manual evidence also covers an agent stop/restart and Retry. | PASS |
| A10 | Diagnostics and privacy | The inspector records ordered run/thread/tool/message IDs and bounded redacted payloads; `scripts/check-protocol-trace.mjs` rejects keys, prompts, user values, private checkpoint keys, and known secrets. `docs/protocol-trace.md` is generated from real SSE events. | PASS |
| A11 | Accessibility and responsive layout | `tests/browser/fixture.spec.ts` covers keyboard review, 375 px no-overflow layout, and tab order; `tests/browser/live.spec.ts` submits by keyboard. Error recovery uses native focusable buttons and an `aria-live` status/alert region. | PASS |
| A12 | Custom request | The live protocol run and live browser suite both submit a previously unlisted laptop-approval request and receive a valid model-composed form. No category-to-template classifier is used. | PASS |

## Live acceptance run

`npm run test:e2e:live` passed on 2026-10-21 with the configured tool-capable
model. The four prompts produced these catalog-validated compositions:

| Case | Components | Bound draft paths | Actions |
| --- | ---: | --- | --- |
| Bug | 8 | `/draft/title`, `/draft/details` | `reviewRequest` |
| Feature | 11 | `/draft/title`, `/draft/details`, `/draft/priority` | `reviewRequest` |
| Meeting | 10 | `/draft/title`, `/draft/details`, `/draft/attendees`, `/draft/proposed_slot` | `reviewRequest` |
| Custom laptop request | 11 | `/draft/title`, `/draft/details`, `/draft/laptop_model`, `/draft/priority`, `/draft/justification` | `reviewRequest` |

The same run exercised the complete action cycle on the bug thread:

```text
invalid-review@editing/0 -> valid-review@review/1 -> follow-up-update@editing/2
-> stale-review@editing/2 -> re-review@review/3 -> edited-submit@editing/4
-> re-review-after-edit@review/5 -> submit@submitted-demo/6
-> double-submit@submitted-demo/6
```

The run regenerated `docs/protocol-trace.md` from the real bridge SSE stream.
`npm run check:trace` passed, including the new requirements for
`generate_a2ui`, `render_a2ui`, `a2ui_action_evidence`, `STATE_SNAPSHOT`, and
`RUN_FINISHED`, and rejection of private checkpoint keys such as
`reviewedValues` and `live-draft-surface`.

## Browser acceptance

`npm run test:e2e:browser` passed 4/4: fixture rendering, in-surface validation,
keyboard review, 375 px layout, tab order, and transport-failure recovery.

`npm run test:e2e:browser:live` passed 2/2 on 2026-10-21: all three examples plus
a custom request, then the review -> priority/justification update -> re-review
-> keyboard submit -> New request journey. Two earlier attempts were stopped by
model-side A2UI generation rejections (`missing_required_prop` and an invalid
`Text` binding). The app exposed the failure for retry, painted no invalid
surface, and did not switch to fixture mode; the suite was rerun as required
for probabilistic live output.

## Deterministic commands

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS, all four workspaces |
| `npm test` | PASS, 104 tests in 13 files (48 agent, 28 shared, 17 web, 11 server) |
| `npm run build` | PASS; only the existing installed-renderer chunk-size warning |
| `npm run test:e2e:fixtures` | PASS, including two-thread isolation, cross-thread rejection, and unknown-action rejection |
| `npm run test:e2e:browser` | PASS, 4 Playwright tests |
| `npm run test:e2e:live` | PASS, four live surfaces plus the full journey |
| `npm run test:e2e:browser:live` | PASS, 2 Playwright tests |
| `npm run check:trace` | PASS, ordered trace and privacy scan |

## Reproduce

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e:fixtures
npm run test:e2e:browser
npm run check:trace

# Live gate: configure apps/agent/.env and apps/server/.env first.
set -a; . apps/agent/.env; set +a
npm run test:e2e:live
npm run test:e2e:browser:live
```

## Independent review

An independent read-only code review of the acceptance changes returned
**APPROVE**. It raised one LOW finding: the cross-thread fixture test could
fall back to the initial feature state/messages if the invalid-review run did
not emit a snapshot. The test now asserts that the post-review state and
messages snapshots exist and uses them directly. The re-review confirmed the
fix and reported no new findings. The reviewer did not run tests; the
deterministic and live commands above were executed by the implementer.

## Residual limits

- Live generation remains probabilistic. A rejected model form is a retryable
  UI error, not a fixture fallback; rerun the live suite after such a rejection.
- The demo is localhost-only with no authentication, production storage,
  external submission, or multi-user isolation.
- Browser coverage includes the main keyboard and 375 px paths, not a full
  screen-reader or axe audit.
- The production bundle warning comes from the installed A2UI renderer
  dependency and was not silenced by replacing renderer code.
