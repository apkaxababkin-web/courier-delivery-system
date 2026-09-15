/**
 * Source-structure guards for the «Расчёты» navigation.
 *
 * The behavioural coverage lives in tests/reports-view.render.test.tsx (real DOM
 * render). What is checked here are the structural invariants that are easy to
 * break in a merge and hard to see in a rendered snapshot:
 *
 *   * the two top-level groups stay in place and the partner reconciliation is
 *     still wired to its own branch;
 *   * switching a client section never resets the client or the period and never
 *     triggers billing work.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const REPORTS_VIEW = path.resolve(__dirname, "..", "courier-manager", "src", "views", "ReportsView.tsx");
const source = fs.readFileSync(REPORTS_VIEW, "utf8");

describe("«Расчёты»: структура навигации", () => {
  it("keeps the two top-level groups and the partner reconciliation branch", () => {
    expect(source).toContain("Сверка партнёров");
    expect(source).toContain("Сверка клиентов");
    expect(source).toContain("data-testid=\"reports-tabs\"");

    // The partner branch must still render the untouched component.
    const partnerBranch = source.slice(source.indexOf("activeTab === 'partners'"));
    expect(partnerBranch).toContain("<PartnerReconciliation />");
  });

  it("renders the three client sections from one always-visible strip", () => {
    expect(source).toContain("data-testid=\"client-sections\"");
    const strip = source.slice(
      source.indexOf('data-testid="client-sections"'),
      source.indexOf("data-testid=\"client-period\"") > 0
        ? source.indexOf('data-testid="client-period"')
        : source.length,
    );
    for (const label of ["Сверка", "Тарифы", "Счета и акты"]) {
      expect(strip).toContain(label);
    }
    // The client list must not be an alternative branch that replaces the tabs.
    expect(source).not.toContain("{!selectedClient ? (");
  });

  it("switching a client section keeps the client and the period", () => {
    const start = source.indexOf("function openClientSection");
    expect(start).toBeGreaterThan(-1);
    const handler = source.slice(start, source.indexOf("}", start));

    expect(handler).toContain("setClientSection(section)");
    expect(handler).not.toContain("setSelectedClientId");
    expect(handler).not.toContain("setDateFrom");
    expect(handler).not.toContain("setDateTo");
    // No billing work happens on navigation.
    expect(handler).not.toContain("issueDocumentSet");
    expect(handler).not.toContain("recalcClientQuotes");
    expect(handler).not.toContain("updateClientTariffs");
  });

  it("keeps the tariffs wired to the existing clientTariffs API", () => {
    expect(source).toContain("getClientTariffs(");
    expect(source).toContain("updateClientTariffs(");
  });
});
