import { getA2UITools } from "@ag-ui/langgraph";
import { toValidationCatalog } from "@arb/shared";
import { inlineCatalogSchema } from "@arb/shared";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export const A2UI_TOOL_SURFACE_SENTINEL = "request-surface";

const GENERATION_GUIDELINES = `You compose declarative forms for a request builder.
- Use only the catalog components supplied in context. Never invent a component or catalog.
- Every form must include the required canonical text bindings /draft/title and /draft/details.
- Button labels must be a separate Text component referenced by the Button child property.
- Buttons use action.event with an object context that includes {path} entries for every editable field plus /meta/revision.
- Do not generate CSS, Tailwind class names, HTML, JSX, links, images, or function-call actions.`;

export function createGenerateA2UITool(model: BaseChatModel) {
  return getA2UITools({
    model,
    catalog: toValidationCatalog(inlineCatalogSchema),
    defaultCatalogId: inlineCatalogSchema.catalogId,
    defaultSurfaceId: A2UI_TOOL_SURFACE_SENTINEL,
    guidelines: {
      generationGuidelines: GENERATION_GUIDELINES,
      compositionGuide:
        "Prefer a Card containing a Column of Text, TextField, ChoicePicker, and Button components. Keep component IDs stable and unique.",
    },
    recovery: { maxAttempts: 3 },
  });
}
