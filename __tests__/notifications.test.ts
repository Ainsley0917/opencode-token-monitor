import { describe, test, expect, beforeEach } from "bun:test";
import {
  shouldShowToast,
  updateState,
  resetState,
  formatCostToast,
  formatQuotaAlertToast,
} from "../lib/notifications";
import type { QuotaStatus } from "../lib/quota";

describe("Notifications", () => {
  beforeEach(() => {
    resetState("test-session-1");
    resetState("test-session-2");
  });

  describe("shouldShowToast", () => {
    test("suppresses toast when delta < $0.10 and time < 5 min", () => {
      const sessionID = "test-session-1";
      
      updateState(sessionID, 1.0, []);
      
      const twoMinutesMs = 2 * 60 * 1000;
      const result = shouldShowToast(1.05, [], sessionID, Date.now() + twoMinutesMs);
      
      expect(result.show).toBe(false);
    });

    test("shows toast when delta >= $0.10", () => {
      const sessionID = "test-session-1";
      
      updateState(sessionID, 1.0, []);
      
      const result = shouldShowToast(1.10, [], sessionID);
      
      expect(result.show).toBe(true);
      expect(result.message).toContain("$1.10");
      expect(result.message).toContain("+$0.10");
    });

    test("shows toast when time >= 5 min even if delta small", () => {
      const sessionID = "test-session-1";
      
      updateState(sessionID, 1.0, []);
      
      const fiveMinutesMs = 5 * 60 * 1000;
      const result = shouldShowToast(1.05, [], sessionID, Date.now() + fiveMinutesMs);
      
      expect(result.show).toBe(true);
      expect(result.message).toContain("$1.05");
    });

    test("shows immediate toast when quota severity worsens (info -> warning)", () => {
      const sessionID = "test-session-1";
      
      const initialQuota: QuotaStatus[] = [
        {
          source: "codex",
          scope: "5h",
          remainingFraction: 0.6,
          severity: "info",
        },
      ];
      
      updateState(sessionID, 1.0, initialQuota);
      
      const worsenedQuota: QuotaStatus[] = [
        {
          source: "codex",
          scope: "5h",
          remainingFraction: 0.3,
          severity: "warning",
        },
      ];
      
      const result = shouldShowToast(1.02, worsenedQuota, sessionID);
      
      expect(result.show).toBe(true);
      expect(result.message).toContain("⚠️");
      expect(result.message).toContain("5h");
    });

    test("shows immediate toast when quota severity worsens (warning -> error)", () => {
      const sessionID = "test-session-1";
      
      const initialQuota: QuotaStatus[] = [
        {
          source: "antigravity",
          scope: "antigravity claude",
          remainingFraction: 0.3,
          severity: "warning",
        },
      ];
      
      updateState(sessionID, 1.0, initialQuota);
      
      const criticalQuota: QuotaStatus[] = [
        {
          source: "antigravity",
          scope: "antigravity claude",
          remainingFraction: 0.05,
          severity: "error",
        },
      ];
      
      const result = shouldShowToast(1.01, criticalQuota, sessionID);
      
      expect(result.show).toBe(true);
      expect(result.message).toContain("⚠️");
      expect(result.message).toContain("antigravity claude");
      expect(result.message).toContain("5%");
    });

    test("does not trigger on quota improvement", () => {
      const sessionID = "test-session-1";
      
      const initialQuota: QuotaStatus[] = [
        {
          source: "codex",
          scope: "5h",
          remainingFraction: 0.1,
          severity: "error",
        },
      ];
      
      updateState(sessionID, 1.0, initialQuota);
      
      const improvedQuota: QuotaStatus[] = [
        {
          source: "codex",
          scope: "5h",
          remainingFraction: 0.6,
          severity: "info",
        },
      ];
      
      const result = shouldShowToast(1.02, improvedQuota, sessionID);
      
      expect(result.show).toBe(false);
    });

    test("handles first call for new session (no previous state)", () => {
      const sessionID = "brand-new-session";
      
      const result = shouldShowToast(0.50, [], sessionID);
      
      expect(result.show).toBe(true);
      expect(result.message).toContain("$0.50");
    });

    test("handles multiple sessions independently", () => {
      const session1 = "session-1";
      const session2 = "session-2";
      
      updateState(session1, 1.0, []);
      updateState(session2, 2.0, []);
      
      const result1 = shouldShowToast(1.05, [], session1);
      expect(result1.show).toBe(false);
      
      const result2 = shouldShowToast(2.20, [], session2);
      expect(result2.show).toBe(true);
    });
  });

  describe("updateState", () => {
    test("updates cost and timestamp", () => {
      const sessionID = "test-session-1";
      
      updateState(sessionID, 1.23, []);
      
      const result = shouldShowToast(1.33, [], sessionID);
      expect(result.show).toBe(true);
    });

    test("stores quota severity history", () => {
      const sessionID = "test-session-1";
      
      const quotas: QuotaStatus[] = [
        {
          source: "codex",
          scope: "5h",
          remainingFraction: 0.6,
          severity: "info",
        },
      ];
      
      updateState(sessionID, 1.0, quotas);
      
      const result = shouldShowToast(1.01, quotas, sessionID);
      expect(result.show).toBe(false);
    });
  });

  describe("resetState", () => {
    test("clears session state on idle", () => {
      const sessionID = "test-session-1";
      
      updateState(sessionID, 5.0, []);
      resetState(sessionID);
      
      const result = shouldShowToast(0.10, [], sessionID);
      expect(result.show).toBe(true);
    });
  });

  describe("formatCostToast", () => {
    test("formats cost with delta", () => {
      const message = formatCostToast(1.23, 0.15);
      
      expect(message).toContain("$1.23");
      expect(message).toContain("+$0.15");
      expect(message.length).toBeLessThan(80);
    });

    test("formats cost without delta", () => {
      const message = formatCostToast(2.45);
      
      expect(message).toContain("$2.45");
      expect(message).not.toContain("+$");
      expect(message.length).toBeLessThan(80);
    });

    test("formats small costs with 4 decimals", () => {
      const message = formatCostToast(0.0012, 0.0003);
      
      expect(message).toContain("$0.0012");
      expect(message).toContain("+$0.0003");
    });
  });

  describe("formatQuotaAlertToast", () => {
    test("formats warning level quota", () => {
      const quota: QuotaStatus = {
        source: "codex",
        scope: "5h",
        remainingFraction: 0.3,
        severity: "warning",
      };
      
      const message = formatQuotaAlertToast(quota);
      
      expect(message).toContain("⚠️");
      expect(message).toContain("5h");
      expect(message).toContain("30%");
      expect(message.length).toBeLessThan(80);
    });

    test("formats error level quota", () => {
      const quota: QuotaStatus = {
        source: "antigravity",
        scope: "antigravity claude",
        remainingFraction: 0.05,
        severity: "error",
      };
      
      const message = formatQuotaAlertToast(quota);
      
      expect(message).toContain("⚠️");
      expect(message).toContain("antigravity claude");
      expect(message).toContain("5%");
      expect(message.length).toBeLessThan(80);
    });

    test("includes reset time if available", () => {
      const quota: QuotaStatus = {
        source: "codex",
        scope: "5h",
        remainingFraction: 0.2,
        severity: "warning",
        resetsAt: "2026-02-08T15:00:00Z",
      };
      
      const message = formatQuotaAlertToast(quota);
      
      expect(message).toContain("⚠️");
      expect(message).toContain("5h");
    });
  });
});
