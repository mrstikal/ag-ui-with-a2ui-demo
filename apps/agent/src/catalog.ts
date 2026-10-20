import { getA2UITools } from "@ag-ui/langgraph";
import { toValidationCatalog } from "@arb/shared";
import { inlineCatalogSchema } from "@arb/shared";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export const A2UI_TOOL_SURFACE_SENTINEL = "request-surface";

export const APPROVED_COMPONENTS_TEXT =
  "Text, Column, Card, TextField, ChoicePicker, Button";

export const FORBIDDEN_COMPONENTS_TEXT =
  "Title, Metric, List, Row, Divider, Image, CheckBox, Slider, DateTimeInput";

export const LIVE_DESIGN_GUIDELINES = "";

export function generationGuidelines(surfaceId: string): string {
  return `You compose declarative forms for a request builder.
- Use only these approved catalog components: ${APPROVED_COMPONENTS_TEXT}. Never use ${FORBIDDEN_COMPONENTS_TEXT} or any other component.
- The root must be a Column or Card with a unique id "root". Keep component ids unique and stable; no cycles.
- Every form must bind /draft/title and /draft/details. Use lowercase snake_case field keys matching /draft/<key>.
- Give every editable field a path binding on "value": empty string for TextField, [] for ChoicePicker. Initialize every bound draft field in the data object. Do not use placeholder, helperText, description, hint, or other unsupported presentation props.
- Add exactly one "Review request" Button with action.event.name "reviewRequest". Do not add submit, discard, or any other action.
- The Button label must be a separate Text component referenced by Button.child.
- The review action context must be a JSON object keyed by field name, never an array. Each value is a {path} entry for an editable field, plus "revision": {path: "/meta/revision"}.
- The data object must include meta: {"revision": 0, "status": "editing"} so /meta/revision resolves. The host owns and overwrites these values. Do not write /errors.
- Do not generate CSS, Tailwind class names, HTML, JSX, links, images, scripts, or function-call actions.
- For this conversation the render surfaceId must be exactly "${surfaceId}". Do not use any other surfaceId.`;
}

export function createGenerateA2UITool(
  model: BaseChatModel,
  surfaceId: string = A2UI_TOOL_SURFACE_SENTINEL,
) {
  return getA2UITools({
    model,
    catalog: toValidationCatalog(inlineCatalogSchema),
    defaultCatalogId: inlineCatalogSchema.catalogId,
    defaultSurfaceId: surfaceId,
    guidelines: {
      generationGuidelines: generationGuidelines(surfaceId),
      designGuidelines: LIVE_DESIGN_GUIDELINES,
      compositionGuide:
        "Use a Card or Column root containing a heading Text, the canonical title and details TextFields, optional approved fields, and one Review request Button. Do not use decorative or unsupported components.",
    },
    recovery: { maxAttempts: 3 },
    onA2UIAttempt: (record) => {
      console.info(
        `[a2ui] attempt=${String(record.attempt)} ok=${String(record.ok)} ` +
          `errors=${record.errors.map((error) => error.code).join(",") || "none"}`,
      );
    },
  });
}
