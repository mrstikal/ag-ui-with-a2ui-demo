import { describe, expect, it } from "vitest";
import { parseForwardedActionText } from "./action.js";

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
