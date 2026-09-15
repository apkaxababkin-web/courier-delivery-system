/**
 * Fixture builder for the billing integration tests.
 *
 * Everything is created through plain SQL against the throwaway database, so the
 * tests seed exactly the columns the server reads and nothing else.
 */
import fs from "node:fs";
import postgres from "postgres";
import { TEST_UPLOADS_DIR, testsDatabase } from "./testDb";

export interface SeedRequest {
  /** Stable handle used by the tests. */
  key: string;
  requestType?: string;
  status?: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  placesCount?: number | null;
  /** Pre-computed amount, as the server would have written it. */
  deliveryFee?: number | null;
  /** True when the manager already verified the amount. */
  checked?: boolean;
  reviewState?: string | null;
  reviewNote?: string | null;
  /** Request date used for the period (completedAt is set for completed ones). */
  date?: string;
  comments?: string;
  id?: number;
}

export interface SeedOptions {
  clientName?: string;
  legalName?: string | null;
  inn?: string | null;
  legalAddress?: string | null;
  /** Tariff card. `null` means "client has no tariff card at all". */
  tariff?: Partial<Record<
    | "deliveryFirstPlace" | "deliveryNextPlace"
    | "transportCompanyFirstPlace" | "transportCompanyNextPlace"
    | "movementFirstPlace" | "movementNextPlace"
    | "otherFirstPlace" | "otherNextPlace",
    number
  >> | null;
  requests?: SeedRequest[];
  /** Omit the billingSettings row so the "no settings yet" path is exercised. */
  withoutSettings?: boolean;
}

export interface SeededRequest extends SeedRequest {
  id: number;
}

export interface SeedResult {
  db: postgres.Sql;
  clientId: number;
  managerId: number;
  requests: SeededRequest[];
  byKey: Record<string, SeededRequest>;
}

export const PERIOD_FROM = "2026-08-16";
export const PERIOD_TO = "2026-08-31";

const DEFAULT_TARIFF = {
  deliveryFirstPlace: 500,
  deliveryNextPlace: 300,
  transportCompanyFirstPlace: 700,
  transportCompanyNextPlace: 400,
  movementFirstPlace: 900,
  movementNextPlace: 500,
  otherFirstPlace: 1000,
  otherNextPlace: 600,
};

const DEFAULT_REQUESTS: SeedRequest[] = [
  { key: "a", requestType: "delivery", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
  { key: "b", requestType: "delivery", status: "completed", placesCount: 1, deliveryFee: 700, checked: true, date: "2026-08-18" },
  { key: "c", requestType: "delivery", status: "completed", placesCount: 2, deliveryFee: 800, date: "2026-08-19" },
  { key: "d", requestType: "delivery", status: "cancelled", placesCount: 1, date: "2026-08-20" },
  { key: "e", requestType: "delivery", status: "in_progress", placesCount: 1, date: "2026-08-21" },
];

/** Our own requisites, complete enough for the readiness checks to pass. */
export const COMPLETE_SETTINGS = {
  executorName: 'ООО «МИГ»',
  executorShortName: 'ООО «МИГ»',
  executorInn: "7701234567",
  executorKpp: "770101001",
  executorOgrn: "1157746123456",
  executorAddress: "г. Москва, ул. Тестовая, д. 1",
  executorPostalAddress: "г. Москва, ул. Тестовая, д. 1",
  executorPhone: "+7 495 000-00-00",
  executorEmail: "billing@example.test",
  bankName: 'АО «Тестбанк»',
  bankBik: "044525225",
  bankAccount: "40702810900000012345",
  bankCorrespondentAccount: "30101810400000000225",
  directorName: "Иванов Иван Иванович",
  directorPosition: "Директор",
  accountantName: "Петрова Пётр Петровна",
  vatMode: "without_vat",
  vatRate: 0,
  vatText: "Без НДС",
  nextDocumentNumber: 1,
  documentNumberPrefix: "",
};

async function resetTables(sql: postgres.Sql): Promise<void> {
  // Generated PDFs/XLSX from the previous test must not leak into this one.
  fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  await sql.unsafe(`
    TRUNCATE "billingDocumentFiles", "billingDocumentRequests", "billingDocuments",
             "requestActivity", "requests", "clientTariffs", "clientPoints",
             "clientRegularClients", "clients", "billingSettings", "managers"
      RESTART IDENTITY CASCADE`);
}

/**
 * Reset the database and seed a client, a tariff card, a manager and requests.
 * Returns the connection so a test can run raw SQL as well.
 */
export async function seed(options: SeedOptions = {}): Promise<SeedResult> {
  const db = await testsDatabase();
  await resetTables(db);

  const manager = await db`
    INSERT INTO "managers" ("username","password","name","email","passwordHash","role")
    VALUES ('billing-tester','x','Тестовый менеджер','billing-tester@example.test','x','manager')
    RETURNING id`;
  const managerId = Number(manager[0].id);

  if (!options.withoutSettings) {
    await db`
      INSERT INTO "billingSettings" ${db(COMPLETE_SETTINGS)}
      RETURNING id`;
  }

  const client = await db`
    INSERT INTO "clients" ("name","address","legalName","inn","legalAddress")
    VALUES (
      ${options.clientName ?? 'Клиент «Тест»'},
      ${options.legalAddress ?? "г. Москва, ул. Клиентская, д. 7"},
      ${options.legalName === undefined ? 'ООО «Клиент Тест»' : options.legalName},
      ${options.inn === undefined ? "7709876543" : options.inn},
      ${options.legalAddress === undefined ? "г. Москва, ул. Клиентская, д. 7" : options.legalAddress}
    ) RETURNING id`;
  const clientId = Number(client[0].id);

  if (options.tariff !== null) {
    const tariff = { ...DEFAULT_TARIFF, ...(options.tariff ?? {}) };
    await db`
      INSERT INTO "clientTariffs" ("clientId","deliveryFirstPlace","deliveryNextPlace",
        "transportCompanyFirstPlace","transportCompanyNextPlace","movementFirstPlace",
        "movementNextPlace","otherFirstPlace","otherNextPlace")
      VALUES (${clientId}, ${tariff.deliveryFirstPlace}, ${tariff.deliveryNextPlace},
        ${tariff.transportCompanyFirstPlace}, ${tariff.transportCompanyNextPlace},
        ${tariff.movementFirstPlace}, ${tariff.movementNextPlace},
        ${tariff.otherFirstPlace}, ${tariff.otherNextPlace})`;
  }

  const requests = options.requests ?? DEFAULT_REQUESTS;
  const seeded: SeededRequest[] = [];

  for (const request of requests) {
    const status = request.status ?? "completed";
    const date = request.date ?? "2026-08-17";
    const rows = await db`
      INSERT INTO "requests" ("createdByUserId","requestType","status","clientId",
        "placesCount","deliveryFee","billingCheckedAt","billingReviewState","billingReviewNote",
        "senderCompany","senderAddress","deliveryAddress","recipientName","comments",
        "createdAt","completedAt","quoteSource")
      VALUES (1, ${request.requestType ?? "delivery"}::request_type, ${status}::request_status, ${clientId},
        ${request.placesCount ?? 1}, ${request.deliveryFee ?? null},
        ${request.checked ? db`now()` : null}, ${request.reviewState ?? null}, ${request.reviewNote ?? null},
        'Склад клиента', 'г. Москва, ул. Откуда, д. 1', 'г. Москва, ул. Куда, д. 2', 'Получатель',
        ${request.comments ?? ""},
        ${date + "T09:00:00Z"}, ${status === "completed" ? date + "T18:00:00Z" : null},
        ${request.checked || request.deliveryFee != null ? "tariff" : null})
      RETURNING id`;
    seeded.push({ ...request, id: Number(rows[0].id) });
  }

  const byKey: Record<string, SeededRequest> = {};
  for (const row of seeded) byKey[row.key] = row;

  return { db, clientId, managerId, requests: seeded, byKey };
}

/** Close the connection a test opened through seed(). */
export async function close(db: postgres.Sql): Promise<void> {
  await db.end();
}

/**
 * Add one more client with a single verified request for the period, WITHOUT
 * resetting the database. Used by tests that need several independent clients
 * while the shared document number counter keeps counting.
 */
export async function addClientWithCheckedRequest(
  db: postgres.Sql,
  name: string,
  options: { deliveryFee?: number; periodFrom?: string; periodTo?: string; requestType?: string } = {},
): Promise<number> {
  const inserted = await db`
    INSERT INTO "clients" ("name","address","legalName","inn","legalAddress")
    VALUES (${name}, 'адрес', ${name}, '7700000000', 'адрес') RETURNING id`;
  const clientId = Number(inserted[0].id);

  const completedAt = `${options.periodFrom ?? "2026-08-17"}T18:00:00Z`;
  const createdAt = `${options.periodFrom ?? "2026-08-17"}T09:00:00Z`;
  await db`
    INSERT INTO "requests" ("createdByUserId","requestType","status","clientId","placesCount",
      "deliveryFee","billingCheckedAt","createdAt","completedAt")
    VALUES (1, ${options.requestType ?? "delivery"}::request_type, 'completed'::request_status, ${clientId}, 1,
      ${options.deliveryFee ?? 500}, now(), ${createdAt}, ${completedAt})`;
  return clientId;
}
