import {
  createSurface,
  updateComponents,
  updateDataModel,
  validateA2UIComponents,
  wrapAsOperationsEnvelope,
} from "@ag-ui/a2ui-toolkit";
import { CATALOG_ID, inlineCatalogSchema, toValidationCatalog } from "@arb/shared";

export const FIXTURE_TOOL_NAME = "build_stage0_fixture";
export const REVIEW_ACTION_NAME = "reviewRequest";

const validationCatalog = toValidationCatalog(inlineCatalogSchema);

export interface FixtureSurface {
  components: Array<Record<string, unknown>>;
  data: Record<string, unknown>;
  envelope: string;
}

export function buildFixtureSurface(surfaceId: string): FixtureSurface {
  const components: Array<Record<string, unknown>> = [
    {
      id: "root",
      component: "Column",
      children: ["heading", "title", "review"],
    },
    {
      id: "heading",
      component: "Text",
      text: "Stage 0 fixture form",
      variant: "h3",
    },
    {
      id: "title",
      component: "TextField",
      label: "Request title",
      value: { path: "/draft/title" },
    },
    {
      id: "review_label",
      component: "Text",
      text: "Review request",
    },
    {
      id: "review",
      component: "Button",
      child: "review_label",
      variant: "primary",
      action: {
        event: {
          name: REVIEW_ACTION_NAME,
          context: {
            title: { path: "/draft/title" },
            revision: { path: "/meta/revision" },
          },
        },
      },
    },
  ];

  const data = {
    draft: { title: "" },
    meta: { revision: 0 },
  };

  const validation = validateA2UIComponents({
    components,
    data,
    catalog: validationCatalog,
  });

  if (!validation.valid) {
    throw new Error(
      `Stage 0 fixture failed catalog validation: ${validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")}`,
    );
  }

  const operations = [
    createSurface(surfaceId, CATALOG_ID),
    updateComponents(surfaceId, components),
    updateDataModel(surfaceId, data),
  ];

  return {
    components,
    data,
    envelope: wrapAsOperationsEnvelope(operations),
  };
}
