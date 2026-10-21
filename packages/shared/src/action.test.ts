import { describe, expect, it } from "vitest";
import { parseForwardedActionText, redactActionContext } from "./action.js";

describe("forwarded action text", () => {
  it("parses the unquoted component format used by the middleware", () => {
    expect(
      parseForwardedActionText(
        'User performed action "reviewRequest" on surface "surface-1" (component: review). Context: {"title":"Login fails","revision":0}',
      ),
    ).toEqual({
      name: "reviewRequest",
      surfaceId: "surface-1",
      sourceComponentId: "review",
      context: { title: "Login fails", revision: 0 },
    });
  });

  it("accepts a quoted component and no component", () => {
    expect(
      parseForwardedActionText(
        'User performed action "reviewRequest" on surface "surface-1" (component: "review"). Context: {}',
      )?.sourceComponentId,
    ).toBe("review");

    expect(
      parseForwardedActionText(
        'User performed action "submitDemoRequest" on surface "surface-1". Context: {"revision":2}',
      ),
    ).toEqual({
      name: "submitDemoRequest",
      surfaceId: "surface-1",
      context: { revision: 2 },
    });
  });

  it("rejects malformed or non-object context", () => {
    expect(
      parseForwardedActionText(
        'User performed action "reviewRequest" on surface "surface-1". Context: not-json',
      ),
    ).toBeNull();
    expect(
      parseForwardedActionText(
        'User performed action "reviewRequest" on surface "surface-1". Context: []',
      ),
    ).toBeNull();
    expect(parseForwardedActionText("unexpected")).toBeNull();
  });
});

describe("action context redaction", () => {
  it("replaces user values with type and length while keeping revision", () => {
    expect(
      redactActionContext({
        title: "Login fails",
        severity: ["high"],
        revision: 3,
        private: true,
      }),
    ).toEqual({
      title: { type: "string", length: 11 },
      severity: { type: "array", length: 1 },
      revision: 3,
      private: { type: "boolean" },
    });
  });

  it("redacts descriptor-shaped values instead of trusting them", () => {
    expect(
      redactActionContext({
        title: { type: "secret", length: 6 },
      }),
    ).toEqual({
      title: { type: "object" },
    });
  });

  it("bounds the number of exposed keys", () => {
    const context = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [
        `field_${String(index)}`,
        "secret",
      ]),
    );

    expect(Object.keys(redactActionContext(context))).toHaveLength(32);
  });
});
