/**
 * Effective date of a request in the client settlement (problems #1).
 *
 * The rule must match the server, which anchors the billing period on
 * `COALESCE(completedAt, createdAt)`. These tests pin the UI rule to it so a
 * cancelled or unfinished request can never render as "—" while it has a createdAt
 * and belongs to the period.
 */
import { describe, expect, it } from "vitest";
import {
  effectiveRequestDate,
  effectiveRequestDateKey,
  formatDateRu,
  toDateKey,
} from "../courier-manager/src/lib/billing-dates";
import { fileNameFromContentDisposition } from "../courier-manager/src/lib/api";

describe("effectiveRequestDate: completedAt ?? createdAt", () => {
  it("A. uses completedAt when the request was completed", () => {
    const request = {
      completedAt: "2026-08-17T18:00:00.000Z",
      createdAt: "2026-08-10T09:00:00.000Z",
    };

    expect(effectiveRequestDate(request)).toBe(request.completedAt);
    expect(effectiveRequestDateKey(request)).toBe(toDateKey(request.completedAt));
  });

  it("B. falls back to createdAt when completedAt is absent (cancelled/unfinished)", () => {
    const cancelled = { completedAt: null, createdAt: "2026-09-07T01:55:28.940Z" };
    const pending = { completedAt: null, createdAt: "2026-09-12T03:08:46.309Z" };
    const inProgress = { completedAt: null, createdAt: "2026-09-14T08:52:58.843Z" };

    expect(effectiveRequestDate(cancelled)).toBe(cancelled.createdAt);
    expect(effectiveRequestDate(pending)).toBe(pending.createdAt);
    expect(effectiveRequestDate(inProgress)).toBe(inProgress.createdAt);
    expect(effectiveRequestDateKey(cancelled)).toBe(toDateKey(cancelled.createdAt));
  });

  it("never renders '—' for a request that has a creation date", () => {
    const rows = [
      { id: 1109, completedAt: null, createdAt: "2026-09-14T08:52:58.843Z" },
      { id: 1086, completedAt: null, createdAt: "2026-09-12T03:08:46.309Z" },
      { id: 1011, completedAt: null, createdAt: "2026-09-07T01:55:28.940Z" },
      { id: 900, completedAt: "2026-08-17T18:00:00.000Z", createdAt: "2026-08-10T09:00:00.000Z" },
    ];

    for (const row of rows) {
      const shown = formatDateRu(effectiveRequestDateKey(row));
      expect(shown).not.toBe("—");
      expect(shown).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    }
  });

  it("keeps '—' only when both dates are missing", () => {
    expect(effectiveRequestDateKey({ completedAt: null, createdAt: null })).toBe("");
    expect(formatDateRu("")).toBe("—");
    expect(formatDateRu(null)).toBe("—");
    expect(formatDateRu("not-a-date")).toBe("—");
  });

  it("ignores an unparsable completedAt instead of losing the request date", () => {
    // A broken completedAt must not shadow a valid createdAt.
    const request = { completedAt: "not-a-date", createdAt: "2026-09-07T01:55:28.940Z" };
    expect(effectiveRequestDate(request)).toBe(request.createdAt);
    expect(formatDateRu(effectiveRequestDateKey(request))).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });
});

describe("fileNameFromContentDisposition", () => {
  it("reads the RFC 5987 form the billing route sends", () => {
    const header = "attachment; filename*=UTF-8''" + encodeURIComponent("Счет_1_2026-09-01.pdf");
    expect(fileNameFromContentDisposition(header)).toBe("Счет_1_2026-09-01.pdf");
  });

  it("reads the plain quoted form and handles a missing header", () => {
    expect(fileNameFromContentDisposition('inline; filename="registry-1.xlsx"')).toBe("registry-1.xlsx");
    expect(fileNameFromContentDisposition(null)).toBeNull();
    expect(fileNameFromContentDisposition("inline")).toBeNull();
  });
});
