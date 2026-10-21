import { describe, expect, it } from "vitest";
import { INITIAL_HEALTH_STATE, reconcileHealth } from "./health.js";

describe("bridge health reconciliation", () => {
  it("ignores a single transient failure", () => {
    const failed = reconcileHealth(INITIAL_HEALTH_STATE, { ok: false });

    expect(failed.showError).toBe(false);
    expect(failed.mode).toBeNull();
    expect(failed.serverRestarted).toBe(false);

    const recovered = reconcileHealth(failed.state, {
      ok: true,
      mode: "fixture",
      instanceId: "instance-a",
    });

    expect(recovered.showError).toBe(false);
    expect(recovered.serverRestarted).toBe(false);
    expect(recovered.mode).toBe("fixture");
  });

  it("reports an outage after the threshold and preserves the form on same-instance recovery", () => {
    const first = reconcileHealth(INITIAL_HEALTH_STATE, {
      ok: true,
      mode: "fixture",
      instanceId: "instance-a",
    });
    const failedOnce = reconcileHealth(first.state, { ok: false });
    const failedTwice = reconcileHealth(failedOnce.state, { ok: false });

    expect(failedTwice.showError).toBe(true);
    expect(failedTwice.mode).toBe("unknown");

    const recovered = reconcileHealth(failedTwice.state, {
      ok: true,
      mode: "fixture",
      instanceId: "instance-a",
    });

    expect(recovered.showError).toBe(false);
    expect(recovered.serverRestarted).toBe(false);
    expect(recovered.mode).toBe("fixture");
    expect(recovered.state.failureCount).toBe(0);
  });

  it("signals a remount only when the server instance changes", () => {
    const first = reconcileHealth(INITIAL_HEALTH_STATE, {
      ok: true,
      mode: "fixture",
      instanceId: "instance-a",
    });

    const same = reconcileHealth(first.state, {
      ok: true,
      mode: "fixture",
      instanceId: "instance-a",
    });
    expect(same.serverRestarted).toBe(false);

    const restarted = reconcileHealth(first.state, {
      ok: true,
      mode: "fixture",
      instanceId: "instance-b",
    });
    expect(restarted.serverRestarted).toBe(true);
    expect(restarted.state.instanceId).toBe("instance-b");
  });

  it("does not remount when the server omits an instance id", () => {
    const first = reconcileHealth(INITIAL_HEALTH_STATE, {
      ok: true,
      mode: "fixture",
      instanceId: "instance-a",
    });
    const withoutId = reconcileHealth(first.state, {
      ok: true,
      mode: "fixture",
    });

    expect(withoutId.serverRestarted).toBe(false);
    expect(withoutId.state.instanceId).toBe("instance-a");
  });

  it("treats an empty instance id as missing", () => {
    const first = reconcileHealth(INITIAL_HEALTH_STATE, {
      ok: true,
      mode: "fixture",
      instanceId: "instance-a",
    });
    const emptyId = reconcileHealth(first.state, {
      ok: true,
      mode: "fixture",
      instanceId: "",
    });

    expect(emptyId.serverRestarted).toBe(false);
    expect(emptyId.state.instanceId).toBe("instance-a");
  });
});
