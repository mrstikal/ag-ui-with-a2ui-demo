export type HealthMode = "fixture" | "live" | "unknown";

export interface HealthObservation {
  ok: boolean;
  mode?: HealthMode;
  instanceId?: string;
}

export interface HealthState {
  instanceId: string | null;
  failureCount: number;
  reportedError: boolean;
}

export interface HealthResult {
  state: HealthState;
  mode: HealthMode | null;
  showError: boolean;
  serverRestarted: boolean;
}

export const INITIAL_HEALTH_STATE: HealthState = {
  instanceId: null,
  failureCount: 0,
  reportedError: false,
};

export function reconcileHealth(
  state: HealthState,
  observation: HealthObservation,
  failureThreshold = 2,
): HealthResult {
  if (!observation.ok) {
    const failureCount = state.failureCount + 1;
    const reportedError =
      state.reportedError || failureCount >= failureThreshold;
    return {
      state: { ...state, failureCount, reportedError },
      mode: reportedError ? "unknown" : null,
      showError: reportedError,
      serverRestarted: false,
    };
  }

  const observedInstanceId =
    observation.instanceId && observation.instanceId.length > 0
      ? observation.instanceId
      : undefined;
  const instanceId = observedInstanceId ?? state.instanceId;
  const serverRestarted = Boolean(
    state.instanceId &&
      observedInstanceId &&
      state.instanceId !== observedInstanceId,
  );
  return {
    state: { instanceId, failureCount: 0, reportedError: false },
    mode: observation.mode ?? "unknown",
    showError: false,
    serverRestarted,
  };
}
