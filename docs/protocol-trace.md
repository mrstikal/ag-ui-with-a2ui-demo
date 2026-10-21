# Protocol trace

Real live run generated 2026-10-20T23:44:05.069Z with model `deepseek/deepseek-v4.1-flash-1017`.

This trace is generated from the SSE events received by `tests/e2e/live.mjs` through the real Express CopilotKit bridge and LangGraph agent. It is sanitized: prompts, model text, tool arguments/results, user-entered field values, and action context values are omitted. Text and tool payloads are represented by character counts; state is limited to public fields; A2UI activities are reduced to operation kinds, surface IDs, component types/counts, host binding paths, and action names. The model API key is never read into this document.

The initial-generation section shows AG-UI text/tool/state/activity ordering and the A2UI activity emitted by the middleware. The journey section shows the deterministic form-edit/action/update cycle, including a stale and a double action. Consecutive identical STATE_SNAPSHOT events are collapsed into a row range with a repeat count; no event is reordered or invented.

## Initial generation - bug example

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=7f370a24-a6b1-4a8d-af34-86e90f44c159 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `TEXT_MESSAGE_START` | messageId=gen-1792539811-xNVkv0QmKAwNTazgdgXD; role=assistant |
| 5 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539811-xNVkv0QmKAwNTazgdgXD; chars=17 |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539811-xNVkv0QmKAwNTazgdgXD; chars=30 |
| 7 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539811-xNVkv0QmKAwNTazgdgXD; chars=14 |
| 8 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539811-xNVkv0QmKAwNTazgdgXD; chars=15 |
| 9 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539811-xNVkv0QmKAwNTazgdgXD; chars=18 |
| 10 | `TEXT_MESSAGE_END` | messageId=gen-1792539811-xNVkv0QmKAwNTazgdgXD |
| 11 | `TOOL_CALL_START` | toolCallId=chatcmpl-tool-bfba7aad4fedc3f6; name=generate_a2ui |
| 12 | `TOOL_CALL_ARGS` | toolCallId=chatcmpl-tool-bfba7aad4fedc3f6; chars=20 |
| 13 | `TOOL_CALL_END` | toolCallId=chatcmpl-tool-bfba7aad4fedc3f6 |
| 14–15 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 2×) |
| 16 | `STEP_FINISHED` | - |
| 17 | `STEP_STARTED` | - |
| 18–155 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 138×) |
| 156 | `TOOL_CALL_START` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; name=render_a2ui |
| 157 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=18 |
| 158 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=19 |
| 159 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=6 |
| 160 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=13 |
| 161 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=8 |
| 162 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=5 |
| 163 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=1 |
| 164 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=927 |
| 165 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=352 |
| 166 | `TOOL_CALL_ARGS` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39; chars=1 |
| 167 | `TOOL_CALL_END` | toolCallId=call-38f96c3d-ebcb-411f-b4c2-bbce267f1d39 |
| 168–232 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 65×) |
| 233 | `TOOL_CALL_START` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; name=render_a2ui |
| 234 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=18 |
| 235 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=19 |
| 236 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=6 |
| 237 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=13 |
| 238 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=8 |
| 239 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=4 |
| 240 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=2 |
| 241 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=1039 |
| 242 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=284 |
| 243 | `TOOL_CALL_ARGS` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026; chars=1 |
| 244 | `TOOL_CALL_END` | toolCallId=call-b3c468bf-2cb5-4e4e-b673-905a891c5026 |
| 245–246 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 2×) |
| 247 | `TOOL_CALL_RESULT` | toolCallId=chatcmpl-tool-bfba7aad4fedc3f6; chars=1729 |
| 248 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other |
| 249 | `TOOL_CALL_RESULT` | toolCallId=chatcmpl-tool-bfba7aad4fedc3f6; chars=2049 |
| 250 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; a2uiOperations=createSurface(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, catalogId=arb://catalog/request-builder.v1); updateComponents(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, count=11, types=[Button,Card,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/severity,/draft/title], actions=[reviewRequest]); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/) |
| 251–253 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other (repeated 3×) |
| 254 | `STEP_FINISHED` | - |
| 255 | `STEP_STARTED` | - |
| 256 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=null; category=other |
| 257–258 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 259 | `STEP_FINISHED` | - |
| 260 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 261 | `MESSAGES_SNAPSHOT` | count=3; roles=user,assistant,tool |
| 262 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb2-d929-71fb-b1d5-3a94321ca009 |

## Stage 4 journey - invalid review

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=693d7f93-aff2-4603-9f7a-43e68b2dc513 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; sourceComponentId=reviewButton; contextKeys=details,revision,severity,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-64542859-ee4e-4052-82af-a37d99e28578; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-64542859-ee4e-4052-82af-a37d99e28578; chars=121 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-64542859-ee4e-4052-82af-a37d99e28578 |
| 8–10 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_a2fed20b-7d2e-458a-a189-d797ef5e591c; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_a2fed20b-7d2e-458a-a189-d797ef5e591c; chars=2194 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_a2fed20b-7d2e-458a-a189-d797ef5e591c |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_a2fed20b-7d2e-458a-a189-d797ef5e591c; chars=1822 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; a2uiOperations=updateComponents(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, count=11, types=[Button,Card,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/severity,/draft/title], actions=[reviewRequest]); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/errors); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/status) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=7; roles=user,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-01fa-757d-8909-9d1c7373682a |

## Stage 4 journey - valid review

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=ef19f041-0f40-486c-9561-127ab95ff8f2 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; sourceComponentId=reviewButton; contextKeys=details,revision,severity,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-2b0e3f76-cfc2-4624-82ee-451f9f98d5eb; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-2b0e3f76-cfc2-4624-82ee-451f9f98d5eb; chars=100 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-2b0e3f76-cfc2-4624-82ee-451f9f98d5eb |
| 8 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=0; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_eb144780-ecfa-43f3-9dec-59406a144dc2; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_eb144780-ecfa-43f3-9dec-59406a144dc2; chars=2728 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_eb144780-ecfa-43f3-9dec-59406a144dc2 |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_eb144780-ecfa-43f3-9dec-59406a144dc2; chars=2278 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; a2uiOperations=updateComponents(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, count=13, types=[Button,Card,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/severity,/draft/title], actions=[reviewRequest,submitDemoRequest]); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/errors); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/status); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=11; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-0451-73c7-b5d9-28dd05328751 |

## Stage 4 journey - follow-up update

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=4543679a-143c-4dbd-90db-cfb00e3e3f71 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `TEXT_MESSAGE_START` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF; role=assistant |
| 5 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF; chars=1 |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF; chars=7 |
| 7 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF; chars=22 |
| 8 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF; chars=20 |
| 9 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF; chars=42 |
| 10 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF; chars=7 |
| 11 | `TEXT_MESSAGE_CONTENT` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF; chars=25 |
| 12 | `TEXT_MESSAGE_END` | messageId=gen-1792539822-HPaZqMVOA2cCxrKm7lBF |
| 13 | `TOOL_CALL_START` | toolCallId=chatcmpl-tool-aaaa45486433095c; name=apply_request_changes |
| 14 | `TOOL_CALL_ARGS` | toolCallId=chatcmpl-tool-aaaa45486433095c; chars=468 |
| 15 | `TOOL_CALL_END` | toolCallId=chatcmpl-tool-aaaa45486433095c |
| 16–17 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 18 | `STEP_FINISHED` | - |
| 19 | `STEP_STARTED` | - |
| 20–22 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 23 | `TOOL_CALL_RESULT` | toolCallId=chatcmpl-tool-aaaa45486433095c; chars=387 |
| 24–26 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 27 | `STEP_FINISHED` | - |
| 28 | `STEP_STARTED` | - |
| 29–30 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 31 | `TEXT_MESSAGE_START` | messageId=fixture-message-fd5385d2-a436-4a8c-b372-76020679ea51; role=assistant |
| 32 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-fd5385d2-a436-4a8c-b372-76020679ea51; chars=114 |
| 33 | `TEXT_MESSAGE_END` | messageId=fixture-message-fd5385d2-a436-4a8c-b372-76020679ea51 |
| 34–35 | `STATE_SNAPSHOT` | mode=live; status=review; revision=1; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 36 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 37 | `STEP_FINISHED` | - |
| 38 | `STEP_STARTED` | - |
| 39–41 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 42 | `TOOL_CALL_START` | toolCallId=call_publish_9fbd5ebb-f65a-4303-987b-bb52125b6d6c; name=publish_request_operations |
| 43 | `TOOL_CALL_ARGS` | toolCallId=call_publish_9fbd5ebb-f65a-4303-987b-bb52125b6d6c; chars=3195 |
| 44 | `TOOL_CALL_END` | toolCallId=call_publish_9fbd5ebb-f65a-4303-987b-bb52125b6d6c |
| 45 | `TOOL_CALL_RESULT` | toolCallId=call_publish_9fbd5ebb-f65a-4303-987b-bb52125b6d6c; chars=2689 |
| 46 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; a2uiOperations=updateComponents(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, count=13, types=[Button,Card,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/severity,/draft/title], actions=[reviewRequest]); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/draft/priority); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/draft/justification); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/errors); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/status); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/revision) |
| 47–49 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 50 | `STEP_FINISHED` | - |
| 51 | `STEP_STARTED` | - |
| 52–54 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 55 | `STEP_FINISHED` | - |
| 56 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 57 | `MESSAGES_SNAPSHOT` | count=16; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool |
| 58 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-06c7-777c-81e5-f862b7873b0a |

## Stage 4 journey - stale review

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=d2c12661-d060-4e94-97a9-bd89b9aa154f |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; sourceComponentId=reviewButton; contextKeys=details,justification,priority,revision,severity,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-f648a259-f9e6-424f-b8f9-0d7b058110ff; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-f648a259-f9e6-424f-b8f9-0d7b058110ff; chars=78 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-f648a259-f9e6-424f-b8f9-0d7b058110ff |
| 8–11 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 4×) |
| 12 | `STEP_FINISHED` | - |
| 13 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 14 | `MESSAGES_SNAPSHOT` | count=19; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant |
| 15 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-0f18-71cf-bf73-07786d2ff1e1 |

## Stage 4 journey - re-review

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=b072976a-22f9-4997-b4fc-7d8023d16183 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; sourceComponentId=reviewButton; contextKeys=details,justification,priority,revision,severity,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-98a39945-29c5-4d34-81c9-deace421b05c; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-98a39945-29c5-4d34-81c9-deace421b05c; chars=100 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-98a39945-29c5-4d34-81c9-deace421b05c |
| 8 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=2; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_dbba43ba-1ddd-4519-b8b9-a3a06a3b6030; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_dbba43ba-1ddd-4519-b8b9-a3a06a3b6030; chars=3426 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_dbba43ba-1ddd-4519-b8b9-a3a06a3b6030 |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_dbba43ba-1ddd-4519-b8b9-a3a06a3b6030; chars=2878 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; a2uiOperations=updateComponents(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, count=15, types=[Button,Card,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/severity,/draft/title], actions=[reviewRequest,submitDemoRequest]); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/errors); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/status); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=23; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-1198-737a-a679-cecbedcd80c5 |

## Stage 4 journey - edited submit

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=ffcc1de1-29f6-4b72-90de-de19afa97640 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=submitDemoRequest; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; sourceComponentId=submit; contextKeys=details,justification,priority,revision,severity,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-5f010bd5-a685-44a7-af76-f182eac295ce; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-5f010bd5-a685-44a7-af76-f182eac295ce; chars=98 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-5f010bd5-a685-44a7-af76-f182eac295ce |
| 8 | `STATE_SNAPSHOT` | mode=live; status=review; revision=3; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_e6131071-0a09-4817-b4a5-61d82b485df0; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_e6131071-0a09-4817-b4a5-61d82b485df0; chars=2993 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_e6131071-0a09-4817-b4a5-61d82b485df0 |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_e6131071-0a09-4817-b4a5-61d82b485df0; chars=2519 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; a2uiOperations=updateComponents(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, count=13, types=[Button,Card,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/severity,/draft/title], actions=[reviewRequest]); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/errors); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/status); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=27; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-13d6-730d-bbb2-4b41dd49eaf7 |

## Stage 4 journey - re-review after edit

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=f2b04dfe-0960-496e-bab2-9e95166ca6c5 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=reviewRequest; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; sourceComponentId=reviewButton; contextKeys=details,justification,priority,revision,severity,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-bfff5eca-a77c-4a85-b36c-b0cd237709ad; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-bfff5eca-a77c-4a85-b36c-b0cd237709ad; chars=100 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-bfff5eca-a77c-4a85-b36c-b0cd237709ad |
| 8 | `STATE_SNAPSHOT` | mode=live; status=editing; revision=4; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_65a58a87-42e6-499a-8a72-37747951251e; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_65a58a87-42e6-499a-8a72-37747951251e; chars=3426 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_65a58a87-42e6-499a-8a72-37747951251e |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_65a58a87-42e6-499a-8a72-37747951251e; chars=2878 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; a2uiOperations=updateComponents(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, count=15, types=[Button,Card,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/severity,/draft/title], actions=[reviewRequest,submitDemoRequest]); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/errors); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/status); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=31; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-1626-770d-9501-46499592af63 |

## Stage 4 journey - submit

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=3adb7f91-8485-4350-9a55-08a3a18378c8 |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=submitDemoRequest; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; sourceComponentId=submit; contextKeys=details,justification,priority,revision,severity,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-f4806070-73cb-48a0-a737-c64f67fab238; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-f4806070-73cb-48a0-a737-c64f67fab238; chars=76 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-f4806070-73cb-48a0-a737-c64f67fab238 |
| 8 | `STATE_SNAPSHOT` | mode=live; status=review; revision=5; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 9–10 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 2×) |
| 11 | `STEP_FINISHED` | - |
| 12 | `STEP_STARTED` | - |
| 13–15 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 16 | `TOOL_CALL_START` | toolCallId=call_publish_f3383d87-aa24-4f4f-9f49-5e35614da7dc; name=publish_request_operations |
| 17 | `TOOL_CALL_ARGS` | toolCallId=call_publish_f3383d87-aa24-4f4f-9f49-5e35614da7dc; chars=2345 |
| 18 | `TOOL_CALL_END` | toolCallId=call_publish_f3383d87-aa24-4f4f-9f49-5e35614da7dc |
| 19 | `TOOL_CALL_RESULT` | toolCallId=call_publish_f3383d87-aa24-4f4f-9f49-5e35614da7dc; chars=1947 |
| 20 | `ACTIVITY_SNAPSHOT` | activityType=a2ui-surface; messageId=a2ui-surface-surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; a2uiOperations=updateComponents(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, count=11, types=[Card,ChoicePicker,Column,Text,TextField], bindings=[/draft/details,/draft/justification,/draft/priority,/draft/severity,/draft/title], actions=[]); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/errors); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/status); updateDataModel(surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b, path=/meta/revision) |
| 21–24 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 4×) |
| 25 | `STEP_FINISHED` | - |
| 26 | `STEP_STARTED` | - |
| 27–29 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 3×) |
| 30 | `STEP_FINISHED` | - |
| 31 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 32 | `MESSAGES_SNAPSHOT` | count=35; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool |
| 33 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-188b-773e-b117-7a0b7f6f0335 |

## Stage 4 journey - double submit

Thread: `a997f51a-a108-4562-86f5-7a3bb80f8e4b`

| # | AG-UI event | Sanitized detail |
| ---: | --- | --- |
| 1 | `RUN_STARTED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=4f71ce55-8fb1-4f5d-a82b-5550faad794d |
| 2 | `STEP_STARTED` | - |
| 3 | `STATE_SNAPSHOT` | - |
| 4 | `CUSTOM` | name=a2ui_action_evidence; action=submitDemoRequest; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; sourceComponentId=submit; contextKeys=details,justification,priority,revision,severity,title |
| 5 | `TEXT_MESSAGE_START` | messageId=fixture-message-05a75413-04af-49a0-a501-5ed3314b006a; role=assistant |
| 6 | `TEXT_MESSAGE_CONTENT` | messageId=fixture-message-05a75413-04af-49a0-a501-5ed3314b006a; chars=64 |
| 7 | `TEXT_MESSAGE_END` | messageId=fixture-message-05a75413-04af-49a0-a501-5ed3314b006a |
| 8–11 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other (repeated 4×) |
| 12 | `STEP_FINISHED` | - |
| 13 | `STATE_SNAPSHOT` | mode=live; status=submitted-demo; revision=6; surfaceId=surface-a997f51a-a108-4562-86f5-7a3bb80f8e4b; category=other |
| 14 | `MESSAGES_SNAPSHOT` | count=38; roles=user,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,user,assistant,tool,assistant,tool,assistant,tool,assistant,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant,tool,assistant |
| 15 | `RUN_FINISHED` | threadId=a997f51a-a108-4562-86f5-7a3bb80f8e4b; runId=01a15bb3-1b04-75af-ac7f-b1b97ce5ca10 |

