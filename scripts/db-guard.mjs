#!/usr/bin/env node
/**
 * scripts/db-guard.mjs — fail-closed guard around the two destructive schema commands.
 *
 *   pnpm db:push     → drizzle-kit push     (declarative: DROPS every object missing from schema.ts)
 *   pnpm db:migrate  → drizzle-kit migrate  (applies every pending migration)
 *
 * Why this exists (measured, see DATABASE_SCHEMA_RECOVERY_PLAN_20261016.md):
 *   production PostgreSQL has 65 tables, `drizzle/schema.ts` declares 46. A push would drop
 *   19 tables (3 634 rows), 25 FK, 9 CHECK, 8 UNIQUE constraints and the billing protection
 *   index `billingDocumentRequests_active_request_key`, then fail on
 *   `ALTER TABLE "hemotestPickups" ALTER COLUMN "courierId" SET NOT NULL` (16 NULL rows).
 *
 * Design rules implemented here:
 *   1. default deny — nothing runs unless the target is positively classified as disposable;
 *   2. NODE_ENV can only *tighten* the decision, never unlock it;
 *   3. the decision uses the real connection configuration AND a read-only fingerprint probe
 *      of the live database (never just the database name or host);
 *   4. unknown / unreachable / ambiguous target → deny;
 *   5. no password, token or full connection string is ever printed;
 *   6. ordinary API start (`node dist/index.js`, entrypoint) does not touch this script;
 *   7. the permission probe is strictly read-only (BEGIN READ ONLY + SELECT/to_regclass).
 *
 * Direct `drizzle-kit push` (bypassing the npm script) cannot be stopped by a Node guard;
 * see DB_GUARD_IMPLEMENTATION_20261016.md for the PostgreSQL privilege-level proposal.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Objects whose presence in the target proves it is (a copy of) the production database. */
export const PRODUCTION_FINGERPRINT_TABLES = [
  "billingDocuments",
  "billingDocumentRequests",
  "billingDocumentEvents",
  "correspondenceShipments",
  "correspondenceManifests",
  "max_client_chats",
  "max_manager_links",
];

/** Disposable database names: *_test, *_dev, *_local, tmp*, scratch* … */
export const DISPOSABLE_DATABASE_RE = /(^|[_-])(test|tests|dev|local|tmp|temp|sandbox|scratch)($|[_-])|_test$|^test/i;

/** More tables than this is treated as a real (non-disposable) dataset. */
export const NON_DISPOSABLE_TABLE_COUNT = 25;

/** Explicit human acknowledgement required to run DDL against a disposable local database. */
export const ACK_TOKEN = "local-disposable";

const PRODUCTION_ENV_FILES = [".env.production", ".env.deepseek"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/* ── secret handling ──────────────────────────────────────────────────────── */

/** Parse a connection string without ever exposing credentials. */
export function parseTarget(databaseUrl) {
  if (databaseUrl === undefined || databaseUrl === null || String(databaseUrl).trim() === "") {
    return { ok: false, reason: "DATABASE_URL is not configured" };
  }
  const raw = String(databaseUrl).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid URL" };
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    return { ok: false, reason: `unsupported protocol (${url.protocol.replace(":", "")})` };
  }
  const host = url.hostname || "";
  const database = decodeURIComponent((url.pathname || "").replace(/^\//, "")) || null;
  return {
    ok: true,
    host,
    port: url.port || "5432",
    database,
    user: url.username ? decodeURIComponent(url.username) : null,
    isLoopback: LOCAL_HOSTS.has(host),
    // The only representation safe to print.
    masked: `postgresql://${url.username ? `${decodeURIComponent(url.username)}:***@` : ""}${host}:${url.port || "5432"}/${(url.pathname || "").replace(/^\//, "")}`,
  };
}

/** Remove credential material from arbitrary text (driver errors love to echo the URL). */
export function sanitize(text, secrets = []) {
  let out = String(text ?? "");
  for (const secret of secrets) {
    if (secret && String(secret).length >= 4) out = out.split(String(secret)).join("***");
  }
  out = out.replace(/(postgres(?:ql)?:\/\/[^\s:@/]+:)[^\s@]+@/gi, "$1***@");
  out = out.replace(/(password|passwd|pwd|secret|token)\s*[=:]\s*\S+/gi, "$1=***");
  return out;
}

/* ── decision (pure, unit-tested) ─────────────────────────────────────────── */

/**
 * @param {object} input
 * @param {string} input.command                     'push' | 'migrate'
 * @param {string|undefined} input.databaseUrl       effective DATABASE_URL
 * @param {string|undefined} input.nodeEnv
 * @param {string|null} input.ack                    DB_GUARD_ACK
 * @param {string[]} input.productionEnvFiles        present production env files in cwd
 * @param {null|{attempted:boolean,connected?:boolean,database?:string|null,host?:string|null,
 *               fingerprint?:{tableCount:number|null, hasBillingDocuments:boolean,
 *                             hasBillingDocumentRequests:boolean, hasCorrespondenceShipments:boolean,
 *                             hasMaxClientChats:boolean, hasMaxManagerLinks:boolean}} input.probe
 * @returns {{decision:'ALLOW'|'DENY', code:string, reasons:string[], target:object|null}}
 */
export function classifyWithoutProbe(input) {
  const target = parseTarget(input.databaseUrl);
  const base = {
    target: target.ok
      ? { host: target.host, port: target.port, database: target.database, user: target.user, masked: target.masked }
      : null,
  };

  if (!target.ok) {
    return { decision: "DENY", code: "NO_CONFIG", reasons: [`connection configuration unusable: ${target.reason}`], ...base };
  }
  if (input.nodeEnv === "production") {
    return { decision: "DENY", code: "NODE_ENV_PRODUCTION", reasons: ["NODE_ENV=production — schema DDL is never run through this guard in production"], ...base };
  }
  const prodEnvFiles = input.productionEnvFiles ?? [];
  if (prodEnvFiles.length > 0) {
    return { decision: "DENY", code: "PRODUCTION_ENV_CONTEXT", reasons: [`production environment files present in the working directory: ${prodEnvFiles.join(", ")}`], ...base };
  }
  if (!target.isLoopback) {
    return { decision: "DENY", code: "REMOTE_HOST", reasons: [`target host "${target.host}" is not loopback — remote/production databases are never modified by this guard`], ...base };
  }
  return null; // the remaining checks need the read-only probe
}

/** Full decision: cheap checks first, then the probe fingerprint checks. */
export function classifyTarget(input) {
  const pre = classifyWithoutProbe(input);
  if (pre) return pre;
  const target = parseTarget(input.databaseUrl);
  const base = {
    target: target.ok
      ? { host: target.host, port: target.port, database: target.database, user: target.user, masked: target.masked }
      : null,
  };
  const probe = input.probe;
  if (!probe || !probe.attempted) {
    return { decision: "DENY", code: "TARGET_UNVERIFIED", reasons: ["the target database was not probed, so it cannot be classified (fail-closed)"], ...base };
  }
  if (!probe.connected) {
    return { decision: "DENY", code: "TARGET_UNREACHABLE", reasons: ["the target database could not be reached and classified (fail-closed)"], ...base };
  }
  const fp = probe.fingerprint ?? {};
  if (fp.tableCount === null || fp.tableCount === undefined) {
    return { decision: "DENY", code: "TARGET_AMBIGUOUS", reasons: ["the target schema could not be inspected (fail-closed)"], ...base };
  }
  const hits = [];
  if (fp.hasBillingDocuments) hits.push("billingDocuments");
  if (fp.hasBillingDocumentRequests) hits.push("billingDocumentRequests");
  if (fp.hasCorrespondenceShipments) hits.push("correspondenceShipments");
  if (fp.hasMaxClientChats) hits.push("max_client_chats");
  if (fp.hasMaxManagerLinks) hits.push("max_manager_links");
  if (hits.length > 0) {
    return { decision: "DENY", code: "PRODUCTION_FINGERPRINT", reasons: [`the target contains production objects: ${hits.join(", ")}`], ...base };
  }
  if (fp.tableCount >= NON_DISPOSABLE_TABLE_COUNT) {
    return { decision: "DENY", code: "PRODUCTION_FINGERPRINT", reasons: [`the target holds ${fp.tableCount} tables (>= ${NON_DISPOSABLE_TABLE_COUNT}) — not a disposable database`], ...base };
  }
  if (!target.database || !DISPOSABLE_DATABASE_RE.test(target.database)) {
    return { decision: "DENY", code: "NON_DISPOSABLE_DATABASE", reasons: [`database name "${target.database ?? "(none)"}" does not look disposable (expected e.g. *_test, *_dev, *_local)`], ...base };
  }
  if (input.ack !== ACK_TOKEN) {
    return { decision: "DENY", code: "NO_ACK", reasons: [`explicit acknowledgement required: set DB_GUARD_ACK=${ACK_TOKEN} for a disposable local database`], ...base };
  }
  return {
    decision: "ALLOW",
    code: "LOCAL_DISPOSABLE",
    reasons: [`loopback target, disposable name, ${fp.tableCount} tables, no production objects, acknowledgement present`],
    ...base,
  };
}

/* ── read-only probe ──────────────────────────────────────────────────────── */

/** Inspect the live target without writing anything: read-only transaction, SELECT only. */
export async function probeTarget(databaseUrl) {
  let sql;
  try {
    const { default: postgres } = await import("postgres");
    sql = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
      connection: { application_name: "db-guard-readonly-probe" },
    });
  } catch (error) {
    return { attempted: true, connected: false, error: sanitize(error?.message ?? error) };
  }

  let conn = null;
  try {
    conn = await sql.reserve();
    await conn.unsafe("SET default_transaction_read_only = on");
    await conn.unsafe("BEGIN READ ONLY");
    await conn.unsafe("SET LOCAL statement_timeout = '3000'");
    await conn.unsafe("SET LOCAL lock_timeout = '1000'");
    const guard = await conn.unsafe("SELECT current_setting('transaction_read_only') AS tx");
    if (guard[0]?.tx !== "on") {
      return { attempted: true, connected: false, error: "read-only transaction could not be established" };
    }
    const identity = await conn.unsafe(
      "SELECT current_database() AS database, coalesce(inet_server_addr()::text, 'local') AS server_addr",
    );
    const counts = await conn.unsafe(
      "SELECT count(*)::int AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    const objects = await conn.unsafe(`
      SELECT to_regclass('public."billingDocuments"') IS NOT NULL AS has_billing_documents,
             to_regclass('public."billingDocumentRequests"') IS NOT NULL AS has_billing_document_requests,
             to_regclass('public."correspondenceShipments"') IS NOT NULL AS has_correspondence_shipments,
             to_regclass('public."max_client_chats"') IS NOT NULL AS has_max_client_chats,
             to_regclass('public."max_manager_links"') IS NOT NULL AS has_max_manager_links`);
    const o = objects[0] ?? {};
    return {
      attempted: true,
      connected: true,
      database: identity[0]?.database ?? null,
      host: identity[0]?.server_addr ?? null,
      fingerprint: {
        tableCount: counts[0]?.table_count ?? null,
        hasBillingDocuments: Boolean(o.has_billing_documents),
        hasBillingDocumentRequests: Boolean(o.has_billing_document_requests),
        hasCorrespondenceShipments: Boolean(o.has_correspondence_shipments),
        hasMaxClientChats: Boolean(o.has_max_client_chats),
        hasMaxManagerLinks: Boolean(o.has_max_manager_links),
      },
    };
  } catch (error) {
    return { attempted: true, connected: false, error: sanitize(error?.message ?? error) };
  } finally {
    try { if (conn) await conn.unsafe("ROLLBACK"); } catch { /* nothing was written */ }
    try { if (conn) conn.release(); } catch { /* ignore */ }
    try { await sql.end({ timeout: 5 }); } catch { /* ignore */ }
  }
}

/* ── CLI ──────────────────────────────────────────────────────────────────── */

function readDotEnv(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

export function collectContext({ cwd = process.cwd(), env = process.env } = {}) {
  const dotEnv = readDotEnv(path.join(cwd, ".env"));
  const databaseUrl = env.DATABASE_URL ?? dotEnv.DATABASE_URL ?? undefined;
  const productionEnvFiles = PRODUCTION_ENV_FILES.filter((f) => fs.existsSync(path.join(cwd, f)));
  return {
    databaseUrl,
    nodeEnv: env.NODE_ENV,
    ack: env.DB_GUARD_ACK ?? null,
    productionEnvFiles,
    secrets: [dotEnv.DATABASE_URL, env.DATABASE_URL].filter(Boolean),
  };
}

function usage() {
  return [
    "db-guard: fail-closed guard for destructive Drizzle commands",
    "",
    "  node scripts/db-guard.mjs push      [--print-decision]",
    "  node scripts/db-guard.mjs migrate   [--print-decision]",
    "",
    "Default: DENY. Runs drizzle-kit only when the target is a loopback database with a",
    `disposable name (e.g. courier_test) that contains no production objects and DB_GUARD_ACK=${ACK_TOKEN} is set.`,
    "Production schema changes follow the manual, reviewed procedure documented in",
    "POSTGRESQL_DEPLOYMENT_GUIDE.md — this guard never performs them.",
    "",
    "Environment knobs:",
    "  DB_GUARD_ACK=local-disposable   explicit acknowledgement for a disposable local DB",
    "  DB_GUARD_NO_PROBE=1             skip the read-only probe (can only make the guard stricter)",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.find((a) => !a.startsWith("--"));
  const printOnly = args.includes("--print-decision");
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  if (command !== "push" && command !== "migrate") {
    console.error(`db-guard: unknown command "${command ?? ""}"\n\n${usage()}`);
    process.exit(2);
  }

  const context = collectContext();
  context.command = command;
  // Cheap checks first: a refused target must not even be contacted.
  const preDecision = classifyWithoutProbe(context);
  const probe = preDecision || process.env.DB_GUARD_NO_PROBE === "1" || !context.databaseUrl
    ? { attempted: false }
    : await probeTarget(context.databaseUrl);
  const decision = preDecision ?? classifyTarget({ ...context, probe });

  const target = decision.target ? decision.target.masked : "(no usable configuration)";
  console.log(`db-guard: ${decision.decision} (${decision.code}) for drizzle-kit ${command}`);
  console.log(`  target: ${target}`);
  for (const reason of decision.reasons) console.log(`  reason: ${reason}`);
  if (probe && probe.attempted && !probe.connected && probe.error) {
    console.log(`  probe: ${sanitize(probe.error, context.secrets)}`);
  }

  if (decision.decision !== "ALLOW") {
    console.error("");
    console.error("  REFUSED: no schema change was attempted, nothing was written.");
    console.error("  Production changes use the manual procedure (backup + review + migration role),");
    console.error("  documented in POSTGRESQL_DEPLOYMENT_GUIDE.md. This guard never runs it automatically.");
    process.exit(1);
  }

  if (printOnly) {
    console.log("  --print-decision: allowed, but drizzle-kit was NOT executed.");
    process.exit(0);
  }

  const bin = path.join(process.cwd(), "node_modules", ".bin", "drizzle-kit");
  if (!fs.existsSync(bin)) {
    console.error(`db-guard: drizzle-kit binary not found at ${bin}; run the package manager install first.`);
    process.exit(1);
  }
  console.log(`db-guard: target accepted — executing "drizzle-kit ${command}"`);
  const child = spawn(bin, [command], { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(`db-guard: failed to start drizzle-kit: ${sanitize(error.message, context.secrets)}`);
    process.exit(1);
  });
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`db-guard: unexpected failure: ${sanitize(error?.message ?? error)}`);
    process.exit(1);
  });
}
