/**
 * @vitest-environment happy-dom
 *
 * Real DOM render test for the «Расчёты» navigation.
 *
 * The previous regression test only inspected the source text and stayed green
 * while the production UI still showed no section tabs. This test mounts the real
 * component and drives the real UI:
 *
 *   open «Сверка клиентов» → three sections visible before any client is chosen
 *   → choose a client → the three sections are still visible
 *   → the client header and the reconciliation table come AFTER the tabs.
 *
 * Rendering goes through `react-dom/client` directly (no @testing-library): that
 * library resolves its own React copy in this monorepo, which makes every hook
 * fail with a null dispatcher. `lucide-react` is aliased to a stub in
 * vitest.config.ts for the same reason (icons are decoration for navigation).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CLIENT_ID = 7;

// The client list only contains clients with completed requests inside the
// selected period, which defaults to the current month.
const now = new Date();
const midMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 17, 9, 0, 0));
const midMonthDone = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 17, 18, 0, 0));

vi.mock("../courier-manager/src/lib/api", () => {
  const client = {
    id: CLIENT_ID,
    name: "Hello Korea",
    address: "г. Москва, ул. Клиентская, д. 7",
    legalName: "ООО «Хелло Корея»",
    inn: "7709876543",
    kpp: "770901001",
    legalAddress: "г. Москва, ул. Клиентская, д. 7",
    ogrn: "1157746123456",
    postalAddress: null,
    contactPerson: "Иванов",
    phone: "+7 999 000-00-00",
    email: "client@example.test",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const request = {
    id: 101,
    clientId: CLIENT_ID,
    clientName: "Hello Korea",
    status: "completed",
    requestType: "delivery",
    placesCount: 2,
    deliveryFee: 800,
    billingCheckedAt: "2026-09-01T10:00:00.000Z",
    billingReviewState: null,
    billingReviewNote: null,
    billingState: "checked",
    billingIssue: null,
    billingBlocking: false,
    statusLabel: "Выполнена",
    tariffCategory: "delivery",
    createdAt: midMonth.toISOString(),
    completedAt: midMonthDone.toISOString(),
  };

  const overview = {
    requests: [request],
    counts: {
      total: 1, completed: 1, unfinished: 0, cancelled: 0, checked: 1, ready: 0,
      unpriced: 0, billed: 0, decisionNeeded: 0, clarification: 0, notBillable: 0,
    },
    checkedAmount: 800,
    readyAmount: 800,
    billedAmount: 0,
    readiness: { ready: true, blockers: [], executorGaps: [], clientGaps: [], unresolved: [] },
    documents: [],
  };

  const tariffs = {
    deliveryFirstPlace: 500, deliveryNextPlace: 300,
    transportCompanyFirstPlace: 700, transportCompanyNextPlace: 400,
    movementFirstPlace: 900, movementNextPlace: 500,
    otherFirstPlace: 1000, otherNextPlace: 600,
    hemotestPointPrice: 0, hemotestSundayFirstPointPrice: 0, hemotestSundayNextPointPrice: 0,
  };

  return {
    getAllClients: vi.fn(async () => [client]),
    getAllRequests: vi.fn(async () => [request]),
    getAllMails: vi.fn(async () => []),
    getPartners: vi.fn(async () => []),
    getBillingOverview: vi.fn(async () => overview),
    recalcClientQuotes: vi.fn(async () => ({ ok: true })),
    recalcRequestQuote: vi.fn(async () => ({ ok: true })),
    setBillingReviewDecision: vi.fn(async () => ({ ok: true })),
    setBillingChecked: vi.fn(async () => ({ ok: true })),
    setMailBillingChecked: vi.fn(async () => ({ ok: true })),
    updateBillingReviewFields: vi.fn(async () => ({ ok: true })),
    updateRequestClient: vi.fn(async () => ({ ok: true })),
    getClientTariffs: vi.fn(async () => tariffs),
    updateClientTariffs: vi.fn(async () => tariffs),
    getDocumentPreview: vi.fn(async () => null),
    issueDocumentSet: vi.fn(async () => ({ ok: false, reason: "test" })),
    getBillingDocuments: vi.fn(async () => []),
    setBillingDocumentPaid: vi.fn(async () => undefined),
    voidBillingDocument: vi.fn(async () => undefined),
    releaseBillingDocument: vi.fn(async () => ({ ok: true, releasedRequestIds: [] })),
    getBillingDocumentHistory: vi.fn(async () => []),
    uploadPaymentProof: vi.fn(async () => undefined),
    removeBillingDocumentFile: vi.fn(async () => undefined),
    getDocumentSettings: vi.fn(async () => null),
    saveDocumentSettings: vi.fn(async () => null),
    uploadDocumentSettingsImage: vi.fn(async () => null),
    billingDocumentFileUrl: (id: number, kind: string) => `/api/file/${id}/${kind}`,
    billingPreviewUrl: () => "/api/preview",
    billingDocumentProofUrl: (proof: { id: number }) => `/api/proof/${proof.id}`,
  };
});

const ReportsView = (await import("../courier-manager/src/views/ReportsView")).default;

let container: HTMLDivElement | null = null;

function waitFor<T>(
  get: () => T | null | undefined,
  timeoutMs = 3000,
  label = "элемент",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      let value: T | null | undefined;
      try {
        value = get();
      } catch {
        value = null;
      }
      if (value) return resolve(value);
      if (Date.now() - started > timeoutMs) {
        const seen = buttons().map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());
        return reject(new Error(`waitFor(${label}): не найдено. Кнопки: ${JSON.stringify(seen)}`));
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container?.querySelectorAll("button") ?? []) as HTMLButtonElement[];
}

/** Section tabs, scoped to their own strip so «Сверка клиента» cannot match. */
/** Top-level «Расчёты» tabs (partners / clients). */
function reportsTabs(): HTMLButtonElement[] {
  const strip = container?.querySelector('[data-testid="reports-tabs"]');
  return Array.from(strip?.querySelectorAll("button") ?? []) as HTMLButtonElement[];
}

function reportsTab(name: string): HTMLButtonElement {
  const found = reportsTabs().find((item) => (item.textContent ?? "").trim() === name);
  if (!found) throw new Error(`Верхняя вкладка не найдена: ${name}`);
  return found;
}

function sectionTabs(): HTMLButtonElement[] {
  const strip = container?.querySelector('[data-testid="client-sections"]');
  return Array.from(strip?.querySelectorAll("button") ?? []) as HTMLButtonElement[];
}

function sectionTab(name: string): HTMLButtonElement | null {
  return sectionTabs().find((item) => (item.textContent ?? "").trim() === name) ?? null;
}

function requireSectionTab(name: string): HTMLButtonElement {
  const found = sectionTab(name);
  if (!found) throw new Error(`Вкладка раздела не найдена: ${name}`);
  return found;
}

function button(name: string | RegExp): HTMLButtonElement | null {
  return buttons().find((item) => {
    const label = (item.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof name === "string" ? label === name : name.test(label);
  }) ?? null;
}

function requireButton(name: string | RegExp): HTMLButtonElement {
  const found = button(name);
  if (!found) throw new Error(`Кнопка не найдена: ${String(name)}`);
  return found;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function pageText(): string {
  return (container?.textContent ?? "").replace(/\s+/g, " ");
}

/** Mount the component and let its data effects settle. */
async function renderReports(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ReportsView />);
  });
  await waitFor(() => reportsTab("Сверка клиентов"));
}

/** Open «Сверка клиентов» and choose the client, like a manager does. */
async function openClient(): Promise<void> {
  await click(reportsTab("Сверка клиентов"));
  await waitFor(() => button(/Hello Korea/), 3000, "клиент в списке");
  await click(requireButton(/Hello Korea/));
  await waitFor(() => (pageText().includes("Сверка клиента") ? true : null), 3000, "заголовок клиента");
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  if (container) {
    container.remove();
    container = null;
  }
});

describe("«Расчёты»: реальный DOM-рендер клиентских разделов", () => {
  it("показывает три раздела сразу после открытия «Сверки клиентов», до выбора клиента", async () => {
    await renderReports();
    await click(reportsTab("Сверка клиентов"));

    // The top-level split is untouched.
    expect(reportsTab("Сверка партнёров")).toBeTruthy();

    // All three client sections exist before any client is chosen.
    expect(sectionTabs().map((tab) => (tab.textContent ?? "").trim())).toEqual([
      "Сверка",
      "Тарифы",
      "Счета и акты",
    ]);

    // The client-specific sections explain why they are not clickable yet.
    expect(requireSectionTab("Тарифы").disabled).toBe(true);
    expect(requireSectionTab("Счета и акты").disabled).toBe(true);

    // Tabs sit above the client list.
    const strip = container!.querySelector('[data-testid="client-sections"]')!;
    const picker = container!.querySelector('[data-testid="client-picker"]')!;
    expect(picker).toBeTruthy();
    expect(strip.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("сохраняет три вкладки после выбора клиента и ставит их выше таблицы", async () => {
    await renderReports();
    await openClient();

    // Still visible, now enabled.
    expect(sectionTabs().map((tab) => (tab.textContent ?? "").trim())).toEqual([
      "Сверка",
      "Тарифы",
      "Счета и акты",
    ]);
    for (const name of ["Сверка", "Тарифы", "Счета и акты"]) {
      expect(requireSectionTab(name).disabled).toBe(false);
    }

    // Page order, compared as real DOM nodes: tabs → period → client header → table.
    const strip = container!.querySelector('[data-testid="client-sections"]')!;
    const period = container!.querySelector('[data-testid="client-period"]')!;
    const heading = container!.querySelector('[data-testid="client-header"]')!;
    const table = container!.querySelector("table")!;
    expect(period).toBeTruthy();
    expect(heading).toBeTruthy();
    expect(table).toBeTruthy();

    expect(strip.compareDocumentPosition(period) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(period.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("переключает разделы, не сбрасывая выбранного клиента", async () => {
    await renderReports();
    await openClient();

    await click(requireSectionTab("Тарифы"));
    await waitFor(() => (pageText().includes("Тарифы клиента") ? true : null));
    for (const name of ["Сверка", "Тарифы", "Счета и акты"]) {
      expect(requireSectionTab(name)).toBeTruthy();
    }

    await click(requireSectionTab("Счета и акты"));
    await waitFor(() => (pageText().includes("Счета и акты клиента") ? true : null));

    // Back to Сверка: same client, no trip through the client list.
    await click(requireSectionTab("Сверка"));
    await waitFor(() => (pageText().includes("Сверка клиента") ? true : null));
    expect(pageText()).not.toContain("Выберите клиента для сверки");
  });
});
