/**
 * Isolated PostgreSQL database for billing integration tests.
 *
 * Safety rules (deliberate, do not relax):
 *   * The database is ALWAYS throwaway: its name must end with `_test` and must
 *     not be the database named in `DATABASE_URL`.
 *   * The production database is only ever READ, and only to copy the schema
 *     SHAPE into tests/fixtures/billing-schema.sql (which is a committed file —
 *     nothing is read at test time).
 *   * No test writes to a non-test database, ever. If the guard below cannot
 *     prove the target is disposable, it refuses to run.
 *
 * What it does:
 *   1. creates `courier_billing_test_<suffix>` on the server of SOURCE_DATABASE_URL,
 *   2. applies tests/fixtures/billing-schema.sql (production-shaped DDL, no data),
 *   3. applies drizzle/migrations/0015_client_billing_documents.sql, so the
 *      migration itself is exercised,
 *   4. points DATABASE_URL at the new database for the whole test process,
 *   5. drops the database in global teardown, together with the generated files.
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "billing-schema.sql");
const MIGRATION_0015 = path.join(
  REPO_ROOT,
  "drizzle",
  "migrations",
  "0015_client_billing_documents.sql",
);

/**
 * One fixed name, not a pid-suffixed one: vitest runs global setup and teardown
 * in different processes, so a per-process name would never be dropped. A fixed
 * name also guarantees a crashed run is cleaned up by the next one.
 */
export const TEST_DB_NAME = "courier_billing_test";
export const TEST_UPLOADS_DIR = path.join(REPO_ROOT, ".tmp-billing-test-uploads");

let admin: postgres.Sql | null = null;
let provisioned = false;

/** The URL of the server we create the throwaway database on. */
function sourceUrl(): string {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Billing integration tests need DATABASE_URL (or TEST_DATABASE_URL). " +
        "Copy .env.test.example to .env.test and point it at your local PostgreSQL.",
    );
  }
  return url;
}

/**
 * Connection used for CREATE/DROP DATABASE. The `postgres` maintenance database
 * does not exist on every server (the project's own server has no such DB), so we
 * connect to the configured database instead. Dropping a database only ever
 * targets TEST_DB_NAME, which cannot equal the configured database (guard below).
 */
function adminUrl(): string {
  return process.env.TEST_DATABASE_ADMIN_URL || sourceUrl();
}

function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

function urlForDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

export function testDatabaseUrl(): string {
  return urlForDatabase(sourceUrl(), TEST_DB_NAME);
}

async function runSqlFile(sql: postgres.Sql, file: string): Promise<void> {
  const text = fs.readFileSync(file, "utf8");
  // `postgres` runs multi-statement strings in one simple query, which is exactly
  // how the migrations are applied by hand in production.
  await sql.unsafe(text);
}

/** Create the throwaway database, apply the schema and migration 0015. */
export async function provisionTestDatabase(): Promise<void> {
  if (provisioned) return;

  const url = sourceUrl();
  const sourceName = databaseNameOf(url);
  if (!TEST_DB_NAME.endsWith("_test")) {
    throw new Error(`Refusing to use ${TEST_DB_NAME}: the name must end with _test`);
  }
  if (sourceName === TEST_DB_NAME) {
    throw new Error("Refusing to run: the test database and the source database are the same");
  }

  // Hard safety net: these tests create and DROP databases, so they must never
  // run against a remote server. Production is only ever touched by the deployed
  // application, not by this harness.
  const host = new URL(url).hostname;
  const localHosts = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];
  if (!localHosts.includes(host) && process.env.TEST_ALLOW_REMOTE_DATABASE !== "1") {
    throw new Error(
      `Refusing to run: ${host} is not a local PostgreSQL host. ` +
        "Billing tests create and drop databases and are meant for local development only.",
    );
  }

  admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${TEST_DB_NAME}"`);

  const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await runSqlFile(sql, FIXTURE);
    await runSqlFile(sql, MIGRATION_0015);
  } finally {
    await sql.end();
  }

  process.env.DATABASE_URL = testDatabaseUrl();
  // Generated documents must never land in the real uploads directory.
  process.env.BILLING_DOCUMENTS_DIR = path.join(TEST_UPLOADS_DIR, "billing-documents");
  process.env.BILLING_SETTINGS_DIR = path.join(TEST_UPLOADS_DIR, "billing-settings");

  provisioned = true;
}

export async function testsDatabase(): Promise<postgres.Sql> {
  await provisionTestDatabase();
  return postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} });
}

/** Drop the throwaway database and delete everything the tests generated. */
export async function destroyTestDatabase(): Promise<void> {
  // Teardown may run in a different process than setup; always drop by name and
  // never rely on the in-process flag alone.
  if (!provisioned && !admin) {
    const url = sourceUrl();
    admin = postgres(adminUrl(), { max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await admin.end();
    admin = null;
    fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
    return;
  }
  if (admin) {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await admin.end();
    admin = null;
  }
  fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  provisioned = false;
}

export function readMigration(name: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, "drizzle", "migrations", name), "utf8");
}
