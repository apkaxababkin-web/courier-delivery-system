/**
 * Regression guard for the «Расчёты» navigation.
 *
 * The client billing screens (reconciliation / tariffs / issued documents) used to
 * be reachable only after a client was selected, which made «Тарифы» and
 * «Счета и акты» effectively invisible: the top level of «Расчёты» showed only
 * «Сверка партнёров» and «Сверка клиентов», and the section switch appeared deep
 * inside the selected client.
 *
 * This test reads the real `ReportsView` source and asserts the structure that
 * makes the three sections explicit and always available. It is a source-structure
 * check on purpose: the page needs a browser and a live API to render, while the
 * defect was pure navigation structure.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const REPORTS_VIEW = path.resolve(__dirname, "..", "courier-manager", "src", "views", "ReportsView.tsx");
const source = fs.readFileSync(REPORTS_VIEW, "utf8");

/** The «Сверка клиентов» branch, i.e. everything after the top-level tab strip. */
function clientBranch(): string {
  const start = source.indexOf("activeTab === 'documents' && selectedClientId === 'all'");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("activeTab === 'partners'", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("«Расчёты»: навигация по клиентским разделам", () => {
  it("keeps the two top-level groups (partners and clients)", () => {
    expect(source).toContain("Сверка партнёров");
    expect(source).toContain("Сверка клиентов");
    // The partner reconciliation component must still be the partner branch.
    const partnerBranch = source.slice(source.indexOf("activeTab === 'partners'"));
    expect(partnerBranch).toContain("<PartnerReconciliation />");
  });

  it("shows all three client sections as tabs", () => {
    const branch = clientBranch();
    // «Сверка» is a plain button, the other two are mapped from their ids.
    const reviewButton = branch.indexOf("onClick={() => openClientSection('review')}");
    expect(reviewButton).toBeGreaterThan(-1);
    expect(branch.slice(reviewButton, reviewButton + 700)).toContain("Сверка");
    expect(branch).toContain("['tariffs', 'Тарифы']");
    expect(branch).toContain("['documents', 'Счета и акты']");
  });

  it("renders the section tabs outside the selected-client branches", () => {
    const branch = clientBranch();
    const tabsIndex = branch.indexOf("onClick={() => openClientSection('review')}");

    expect(tabsIndex).toBeGreaterThan(-1);

    // «Тарифы» and «Счета и акты» must be in the same always-visible strip, not in
    // the selected-client-only markup.
    const selectedClientAt = branch.indexOf("{selectedClient && (");
    expect(selectedClientAt).toBeGreaterThan(-1);
    expect(tabsIndex).toBeLessThan(selectedClientAt);

    // The client picker must be a plain conditional, never an alternative branch
    // that replaces the tabs.
    expect(branch).toContain("{!selectedClient && (");
    expect(branch).not.toMatch(/\{!selectedClient \? \(/);
  });

  it("disables the client-specific sections until a client is chosen", () => {
    const branch = clientBranch();
    // Disabled buttons explaining why are the whole point: no hidden sections.
    expect(branch).toContain("disabled={!selectedClient}");
    expect(branch).toContain("Сначала выберите клиента");
    expect(branch).toContain("Выберите клиента ниже, чтобы открыть тарифы и документы");
  });

  it("keeps the client and the period when switching sections", () => {
    // The three sections are plain component state, so switching is a setState:
    // the selected client and the period stay untouched.
    expect(source).toContain("function openClientSection(section: 'review' | 'tariffs' | 'documents')");
    expect(source).toMatch(/const \[clientSection, setClientSection\] = useState<'review' \| 'tariffs' \| 'documents'>\('review'\)/);
    expect(source).toContain("const [selectedClientId, setSelectedClientId] = useState<number | null | 'all'>('all')");
    // Switching must not reset the client or the dates.
    const handler = source.slice(
      source.indexOf("function openClientSection"),
      source.indexOf("}", source.indexOf("function openClientSection")),
    );
    expect(handler).not.toContain("setSelectedClientId");
    expect(handler).not.toContain("setDateFrom");
    expect(handler).not.toContain("setDateTo");
  });

  it("does not issue, recalculate or backfill anything while navigating", () => {
    const handler = source.slice(
      source.indexOf("function openClientSection"),
      source.indexOf("}", source.indexOf("function openClientSection")),
    );
    expect(handler).not.toContain("issueDocumentSet");
    expect(handler).not.toContain("recalcClientQuotes");
    expect(handler).not.toContain("updateClientTariffs");
    // Tariffs keep using the existing clientTariffs API.
    expect(source).toContain("getClientTariffs(");
    expect(source).toContain("updateClientTariffs(");
  });
});
