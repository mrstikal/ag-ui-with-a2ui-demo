# Protocol trace

Real live run generated 2026-10-21T00:24:29.081Z with model `deepseek/deepseek-v4.1-flash-1017`.

This trace is generated from the SSE events received by `tests/e2e/live.mjs` through the real Express CopilotKit bridge and LangGraph agent. It is sanitized: prompts, model text, tool arguments/results, user-entered field values, and action context values are omitted. Text and tool payloads are represented by character counts; state is limited to public fields; A2UI activities are reduced to operation kinds, surface IDs, component types/counts, host binding paths, and action names. The model API key is never read into this document.

The initial-generation section shows AG-UI text/tool/state/activity ordering and the A2UI activity emitted by the middleware. The journey section shows the deterministic form-edit/action/update cycle, including a stale and a double action. Consecutive identical STATE_SNAPSHOT events are collapsed into a row range with a repeat count; no event is reordered or invented.

## Initial generation - bug example

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=283c1ad1-647d-4541-afa7-2371c70a6e00 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `TEXT_MESSAGE_START` | messageId=gen-1792542225-6CknPSX3XPkuYeqXe3Us; role=assistant |
| 5 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542225-6CknPSX3XPkuYeqXe3Us; chars=17 |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542225-6CknPSX3XPkuYeqXe3Us; chars=30 |
| 7 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542225-6CknPSX3XPkuYeqXe3Us; chars=19 |
| 8 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542225-6CknPSX3XPkuYeqXe3Us; chars=17 |
| 9 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542225-6CknPSX3XPkuYeqXe3Us; chars=7 |
| 10 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542225-6CknPSX3XPkuYeqXe3Us; chars=13 |
| 11 | `TEXT_MESSAGE_END` | messageId=gen-1792542225-6CknPSX3XPkuYeqXe3Us |
| 12 | `TOOL_CALL_START` | toolCallId=call-defd22c9-3f27-417b-8204-8c5410fb6b95; name=generate_a2ui |
| 13 | `TOOL_CALL_ARGS` | toolCallId=call-defd22c9-3f27-417b-8204-8c5410fb6b95; chars=19 |
| 14 | `TOOL_CALL_END` | toolCallId=call-defd22c9-3f27-417b-8204-8c5410fb6b95 |
| 15–16 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 2×) |
| 17 | `STEP_FINISHED` | - |
| 18 | `STEP_STARTED` | - |
| 19–146 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 128×) |
| 147 | `TOOL_CALL_START` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4; name=render_a2ui |
| 148 | `TOOL_CALL_ARGS` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4; chars=18 |
| 149 | `TOOL_CALL_ARGS` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4; chars=20 |
| 150 | `TOOL_CALL_ARGS` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4; chars=5 |
| 151 | `TOOL_CALL_ARGS` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4; chars=11 |
| 152 | `TOOL_CALL_ARGS` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4; chars=10 |
| 153 | `TOOL_CALL_ARGS` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4; chars=6 |
| 154 | `TOOL_CALL_ARGS` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4; chars=1076 |
| 155 | `TOOL_CALL_END` | toolCallId=call-7fc54dd6-75bb-4895-8b1b-7d586c9bdce4 |
| 156–277 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 122×) |
| 278 | `TOOL_CALL_START` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; name=render_a2ui |
| 279 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=18 |
| 280 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=20 |
| 281 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=5 |
| 282 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=11 |
| 283 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=8 |
| 284 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=7 |
| 285 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=1 |
| 286 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=657 |
| 287 | `TOOL_CALL_ARGS` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197; chars=85 |
| 288 | `TOOL_CALL_END` | toolCallId=call-cc090f77-1038-4e37-87cd-4e59bef91197 |
| 289–290 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 2×) |
| 291 | `TOOL_CALL_RESULT` | toolCallId=call-defd22c9-3f27-417b-8204-8c5410fb6b95; chars=1147 |
| 292 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other |
| 293 | `TOOL_CALL_RESULT` | toolCallId=call-defd22c9-3f27-417b-8204-8c5410fb6b95; chars=1402 |
| 294 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; a2uiOperations=createSurface(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, catalogId=arb://catalog/request-builder.v1); updateComponents(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, count=8, types=[Button,Column,Text,TextField], bindings=[/draft/details,/draft/title], actions=[reviewRequest]); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/) |
| 295–297 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 3×) |
| 298 | `STEP_FINISHED` | - |
| 299 | `STEP_STARTED` | - |
| 300 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other |
| 301–302 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 303 | `STEP_FINISHED` | - |
| 304 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 305 | `MESSAGES_SNAPSHOT` | count=3; roles=user,assistant,tool |
| 306 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd7-afb6-7748-94e6-366200a03d42 |

## Stage 4 journey - invalid review

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=549bc6f2-0d37-433c-8f5b-ba402f6889c7 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; sourceComponentId=reviewBtn; contextKeys=details,revision,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-2a73b07c-5108-4455-9496-ac86722d5dcf; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-2a73b07c-5108-4455-9496-ac86722d5dcf; chars=142 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-2a73b07c-5108-4455-9496-ac86722d5dcf |
| 8–10 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_cbf7e395-31a5-4d86-b539-df0b894f7d3d; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_cbf7e395-31a5-4d86-b539-df0b894f7d3d; chars=1721 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_cbf7e395-31a5-4d86-b539-df0b894f7d3d |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_cbf7e395-31a5-4d86-b539-df0b894f7d3d; chars=1429 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; a2uiOperations=updateComponents(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, count=8, types=[Button,Column,Text,TextField], bindings=[/draft/details,/draft/title], actions=[reviewRequest]); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/errors); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/status) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=7; roles=user,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd7-f5a9-7271-88fd-476c9a0fd8fd |

## Stage 4 journey - valid review

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=f3a07686-4f2d-45a7-8609-857c41567445 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; sourceComponentId=reviewBtn; contextKeys=details,revision,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-2d4f713e-ce11-4561-8ac0-3c9ca7fbb5c9; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-2d4f713e-ce11-4561-8ac0-3c9ca7fbb5c9; chars=100 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-2d4f713e-ce11-4561-8ac0-3c9ca7fbb5c9 |
| 8 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_ef840413-d8ec-41e2-bff3-5626c73ddaf0; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_ef840413-d8ec-41e2-bff3-5626c73ddaf0; chars=2153 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_ef840413-d8ec-41e2-bff3-5626c73ddaf0 |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_ef840413-d8ec-41e2-bff3-5626c73ddaf0; chars=1793 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; a2uiOperations=updateComponents(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, count=10, types=[Button,Column,Text,TextField], bindings=[/draft/details,/draft/title], actions=[reviewRequest,submitDemoRequest]); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/errors); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/status); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=11; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd7-f7d3-75ff-a8ad-5a466cb35970 |

## Stage 4 journey - follow-up update

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=eed17768-fec5-404a-8a85-4da7ea7a410d |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `TEXT_MESSAGE_START` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN; role=assistant |
| 5 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN; chars=1 |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN; chars=18 |
| 7 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN; chars=11 |
| 8 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN; chars=20 |
| 9 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN; chars=29 |
| 10 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN; chars=32 |
| 11 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN; chars=3 |
| 12 | `TEXT_MESSAGE_END` | messageId=gen-1792542243-CqrrrKah5CgQR5wI3VcN |
| 13 | `TOOL_CALL_START` | toolCallId=call-56575259-7735-4098-86d7-8a25f45b46fd; name=apply_request_changes |
| 14 | `TOOL_CALL_ARGS` | toolCallId=call-56575259-7735-4098-86d7-8a25f45b46fd; chars=436 |
| 15 | `TOOL_CALL_END` | toolCallId=call-56575259-7735-4098-86d7-8a25f45b46fd |
| 16–17 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 18 | `STEP_FINISHED` | - |
| 19 | `STEP_STARTED` | - |
| 20–22 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 23 | `TOOL_CALL_RESULT` | toolCallId=call-56575259-7735-4098-86d7-8a25f45b46fd; chars=387 |
| 24–26 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 27 | `STEP_FINISHED` | - |
| 28 | `STEP_STARTED` | - |
| 29–30 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 31 | `TEXT_MESSAGE_START` | messageId=fixture-message-856408f5-c158-4246-bdd6-2da625154510; role=assistant |
| 32 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-856408f5-c158-4246-bdd6-2da625154510; chars=114 |
| 33 | `TEXT_MESSAGE_END` | messageId=fixture-message-856408f5-c158-4246-bdd6-2da625154510 |
| 34–35 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 36 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 37 | `STEP_FINISHED` | - |
| 38 | `STEP_STARTED` | - |
| 39–41 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 42 | `TOOL_CALL_START` | toolCallId=call_publish_c2a17a01-134e-4880-a746-2601bcb777eb; name=publish_request_operations |
| 43 | `TOOL_CALL_ARGS` | toolCallId=call_publish_c2a17a01-134e-4880-a746-2601bcb777eb; chars=2664 |
| 44 | `TOOL_CALL_END` | toolCallId=call_publish_c2a17a01-134e-4880-a746-2601bcb777eb |
| 45 | `TOOL_CALL_RESULT` | toolCallId=call_publish_c2a17a01-134e-4880-a746-2601bcb777eb; chars=2242 |
| 46 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; a2uiOperations=updateComponents(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, count=10, types=[Button,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/title], actions=[reviewRequest]); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/draft/priority); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/draft/justification); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/errors); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/status); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/revision) |
| 47–49 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 50 | `STEP_FINISHED` | - |
| 51 | `STEP_STARTED` | - |
| 52–54 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 55 | `STEP_FINISHED` | - |
| 56 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 57 | `MESSAGES_SNAPSHOT` | count=16; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool |
| 58 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd7-f9f9-7446-a30c-8fa565966e31 |

## Stage 4 journey - stale review

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=f14cbb5b-b723-447e-a920-d7dc40958865 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; sourceComponentId=reviewBtn; contextKeys=details,justification,priority,revision,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-7500644a-d6a3-429d-98da-13f2ee5d6d0b; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-7500644a-d6a3-429d-98da-13f2ee5d6d0b; chars=78 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-7500644a-d6a3-429d-98da-13f2ee5d6d0b |
| 8–11 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 4×) |
| 12 | `STEP_FINISHED` | - |
| 13 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 14 | `MESSAGES_SNAPSHOT` | count=19; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant |
| 15 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd8-157d-7006-bc92-17cf97c80f13 |

## Stage 4 journey - re-review

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=3826a365-4a9f-4290-97fb-8aad29136f5b |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; sourceComponentId=reviewBtn; contextKeys=details,justification,priority,revision,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-3fac55a6-9066-4640-8612-7f388e006cc5; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-3fac55a6-9066-4640-8612-7f388e006cc5; chars=100 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-3fac55a6-9066-4640-8612-7f388e006cc5 |
| 8 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_29514d43-de3f-4fab-98be-fd4c74ca5d57; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_29514d43-de3f-4fab-98be-fd4c74ca5d57; chars=2851 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_29514d43-de3f-4fab-98be-fd4c74ca5d57 |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_29514d43-de3f-4fab-98be-fd4c74ca5d57; chars=2393 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; a2uiOperations=updateComponents(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, count=12, types=[Button,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/title], actions=[reviewRequest,submitDemoRequest]); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/errors); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/status); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=23; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd8-1802-779d-bb9c-9a0b678c12f0 |

## Stage 4 journey - edited submit

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=3955371a-c794-4d67-975f-f0ec50691efa |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=submitDemoRequest; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; sourceComponentId=submit; contextKeys=details,justification,priority,revision,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-92d5c6db-0162-424b-ba65-41eea9881824; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-92d5c6db-0162-424b-ba65-41eea9881824; chars=98 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-92d5c6db-0162-424b-ba65-41eea9881824 |
| 8 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_630cee92-8263-4fd5-b96a-0baf65e8ded7; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_630cee92-8263-4fd5-b96a-0baf65e8ded7; chars=2462 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_630cee92-8263-4fd5-b96a-0baf65e8ded7 |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_630cee92-8263-4fd5-b96a-0baf65e8ded7; chars=2072 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; a2uiOperations=updateComponents(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, count=10, types=[Button,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/title], actions=[reviewRequest]); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/errors); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/status); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=27; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd8-1a57-73be-85ed-2f46d4037af1 |

## Stage 4 journey - re-review after edit

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=77705b8a-5627-4c20-b187-896b2dc7fe45 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; sourceComponentId=reviewBtn; contextKeys=details,justification,priority,revision,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-37c4b1c0-6ae7-4e03-8066-90d6a9f5f85b; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-37c4b1c0-6ae7-4e03-8066-90d6a9f5f85b; chars=100 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-37c4b1c0-6ae7-4e03-8066-90d6a9f5f85b |
| 8 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_5f7db0b8-3be1-47b2-abe1-181855e0ff33; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_5f7db0b8-3be1-47b2-abe1-181855e0ff33; chars=2851 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_5f7db0b8-3be1-47b2-abe1-181855e0ff33 |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_5f7db0b8-3be1-47b2-abe1-181855e0ff33; chars=2393 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; a2uiOperations=updateComponents(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, count=12, types=[Button,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/title], actions=[reviewRequest,submitDemoRequest]); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/errors); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/status); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=31; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd8-1ce4-7341-90ea-5c66fa6c5417 |

## Stage 4 journey - submit

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=9ec2fa80-d71a-49c6-8009-8748243cdac3 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=submitDemoRequest; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; sourceComponentId=submit; contextKeys=details,justification,priority,revision,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-d3487321-2e16-4845-94b8-25052616f49b; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-d3487321-2e16-4845-94b8-25052616f49b; chars=76 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-d3487321-2e16-4845-94b8-25052616f49b |
| 8 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_209e01a0-f9f3-445d-8d72-8753f47d341d; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_209e01a0-f9f3-445d-8d72-8753f47d341d; chars=1870 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_209e01a0-f9f3-445d-8d72-8753f47d341d |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_209e01a0-f9f3-445d-8d72-8753f47d341d; chars=1550 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; a2uiOperations=updateComponents(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, count=8, types=[ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/title], actions=[]); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/errors); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/status); updateDataModel(surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=35; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd8-1f30-74a1-b3d3-9beaaaff1573 |

## Stage 4 journey - double submit

Thread: `aacea702-d9ba-40be-b2e4-1e9159e16a09`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=6ba04ce7-1381-4da6-88f4-ad8ece098f3e |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=submitDemoRequest; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; sourceComponentId=submit; contextKeys=details,justification,priority,revision,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-b21c400d-7a5f-4a5a-97f3-5eeb908cbe19; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-b21c400d-7a5f-4a5a-97f3-5eeb908cbe19; chars=64 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-b21c400d-7a5f-4a5a-97f3-5eeb908cbe19 |
| 8–11 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other (repeated 4×) |
| 12 | `STEP_FINISHED` | - |
| 13 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-aacea702-d9ba-40be-b2e4-1e9159e16a09; category=other |
| 14 | `MESSAGES_SNAPSHOT` | count=38; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant |
| 15 | `RUN_FINISHED` | threadId=aacea702-d9ba-40be-b2e4-1e9159e16a09; runId=01a15bd8-21c3-70de-b0fd-117cc236eb92 |

