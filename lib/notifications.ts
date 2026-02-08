import type { QuotaStatus, Severity } from "./quota";

const COST_DELTA_THRESHOLD = 0.10;
const TIME_THRESHOLD_MS = 5 * 60 * 1000;

export type NotificationState = {
  lastCost: number;
  lastToastAt: number;
  previousQuotaSeverities: Map<string, Severity>;
};

const sessionStore = new Map<string, NotificationState>();

function getState(sessionID: string): NotificationState {
  let state = sessionStore.get(sessionID);
  if (!state) {
    state = {
      lastCost: 0,
      lastToastAt: 0,
      previousQuotaSeverities: new Map(),
    };
    sessionStore.set(sessionID, state);
  }
  return state;
}

function severityWorsened(prev: Severity, current: Severity): boolean {
  const severityRank = { info: 0, warning: 1, error: 2 };
  return severityRank[current] > severityRank[prev];
}

export function shouldShowToast(
  currentCost: number,
  quotaStatuses: QuotaStatus[],
  sessionID: string,
  nowOverride?: number
): { show: boolean; message?: string } {
  const state = getState(sessionID);
  const now = nowOverride ?? Date.now();

  if (state.lastToastAt === 0) {
    return { show: true, message: formatCostToast(currentCost) };
  }

  if (state.previousQuotaSeverities.size > 0) {
    for (const quota of quotaStatuses) {
      const key = `${quota.source}/${quota.scope}`;
      const prevSeverity = state.previousQuotaSeverities.get(key);
      if (prevSeverity && severityWorsened(prevSeverity, quota.severity)) {
        return { show: true, message: formatQuotaAlertToast(quota) };
      }
    }
  }

  const delta = currentCost - state.lastCost;
  if (delta >= COST_DELTA_THRESHOLD) {
    return { show: true, message: formatCostToast(currentCost, delta) };
  }

  const elapsed = now - state.lastToastAt;
  if (elapsed >= TIME_THRESHOLD_MS) {
    return { show: true, message: formatCostToast(currentCost) };
  }

  return { show: false };
}

export function updateState(
  sessionID: string,
  cost: number,
  quotaStatuses: QuotaStatus[]
): void {
  const state = getState(sessionID);
  state.lastCost = cost;
  state.lastToastAt = Date.now();

  state.previousQuotaSeverities.clear();
  for (const quota of quotaStatuses) {
    const key = `${quota.source}/${quota.scope}`;
    state.previousQuotaSeverities.set(key, quota.severity);
  }
}

export function resetState(sessionID: string): void {
  sessionStore.delete(sessionID);
}

export function formatCostToast(cost: number, delta?: number): string {
  const costStr = `$${cost.toFixed(4)}`;
  if (delta !== undefined) {
    const deltaStr = `+$${delta.toFixed(4)}`;
    return `Session: ${costStr} (${deltaStr})`;
  }
  return `Session: ${costStr}`;
}

export function formatQuotaAlertToast(status: QuotaStatus): string {
  const percent = Math.round(status.remainingFraction * 100);
  const scopeLabel = status.scope;
  
  if (status.severity === "error") {
    return `⚠️ ${scopeLabel} at ${percent}% remaining!`;
  }
  
  return `⚠️ ${scopeLabel} quota at ${percent}%`;
}
