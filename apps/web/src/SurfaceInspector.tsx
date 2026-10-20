import type { SurfaceSummary } from "./surface.js";

const LIFECYCLE_STYLES: Record<SurfaceSummary["lifecycle"], string> = {
  none: "bg-slate-100 text-slate-600",
  building: "bg-amber-100 text-amber-900",
  retrying: "bg-amber-100 text-amber-900",
  failed: "bg-rose-100 text-rose-900",
  painted: "bg-violet-100 text-violet-900",
  deleted: "bg-slate-200 text-slate-700",
};

export function SurfaceInspector({ surface }: { surface: SurfaceSummary }) {
  return (
    <section
      className="border-b border-violet-200 bg-violet-50/60 px-3 py-2"
      aria-label="A2UI surface inspector"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-900">
          A2UI Surface Inspector
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${LIFECYCLE_STYLES[surface.lifecycle]}`}
        >
          {surface.lifecycle}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 font-mono text-[10px] leading-4 text-violet-950">
        <dt className="text-violet-700">catalog</dt>
        <dd className="break-all">{surface.catalogId ?? "n/a"}</dd>
        <dt className="text-violet-700">surface</dt>
        <dd className="break-all">{surface.surfaceId ?? "n/a"}</dd>
        <dt className="text-violet-700">activity</dt>
        <dd className="break-all">{surface.activityMessageId ?? "n/a"}</dd>
        <dt className="text-violet-700">operations</dt>
        <dd className="break-all">
          {surface.operations.length > 0 ? surface.operations.join(", ") : "none"}
        </dd>
        <dt className="text-violet-700">components</dt>
        <dd className="break-all">
          {surface.componentTypes.length > 0
            ? `${String(surface.components.length)}: ${surface.componentTypes.join(", ")}`
            : "none"}
        </dd>
        <dt className="text-violet-700">bindings</dt>
        <dd className="break-all">
          {surface.bindingPaths.length > 0
            ? surface.bindingPaths.join(", ")
            : "none"}
        </dd>
        <dt className="text-violet-700">validation</dt>
        <dd
          className={
            surface.validationErrors.length > 0
              ? "break-words text-rose-800"
              : "break-words text-emerald-800"
          }
        >
          {surface.validationErrors.length > 0
            ? surface.validationErrors.slice(0, 4).join(" | ")
            : "no errors"}
        </dd>
        <dt className="text-violet-700">updated</dt>
        <dd className="break-all">{surface.updatedAt ?? "n/a"}</dd>
      </dl>

      {surface.lifecycle === "none" ? (
        <p className="mt-2 text-[11px] text-violet-800">
          No valid A2UI activity observed yet. Fixture mode paints only
          catalog-validated operations.
        </p>
      ) : null}
    </section>
  );
}
