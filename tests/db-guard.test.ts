/**
 * Stage A guard tests — DB-free by design.
 *
 * Every case uses a synthetic configuration. Nothing here connects to PostgreSQL:
 * the CLI runs with DB_GUARD_NO_PROBE=1 (the probe is the only network step and it is
 * read-only anyway) inside a throwaway temp working directory, so the repository's own
 * `.env` — which points at the real server — is never read.
 */
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ACK_TOKEN, classifyTarget, parseTarget, sanitize } from "../scripts/db-guard.mjs";

const REPO = path.resolve(__dirname, "..");
const GUARD = path.join(REPO, "scripts", "db-guard.mjs");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "db-guard-test-"));

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

const LOCAL_URL = "postgresql://courier:localpw@127.0.0.1:5432/courier_test";
const REMOTE_URL = "postgresql://courier:remotepw@db.example.com:5432/courier_db";

/** A clean, disposable-looking fingerprint (empty database). */
const cleanProbe = (tableCount: number | null = 0) => ({
  attempted: true,
  connected: true,
  database: "courier_test",
  host: "127.0.0.1",
  fingerprint: {
    tableCount,
    hasBillingDocuments: false,
    hasBillingDocumentRequests: false,
    hasCorrespondenceShipments: false,
    hasMaxClientChats: false,
    hasMaxManagerLinks: false,
  },
});

const base = {
  command: "push",
  databaseUrl: LOCAL_URL,
  nodeEnv: "development",
  ack: ACK_TOKEN,
  productionEnvFiles: [],
  probe: cleanProbe(),
};

/** Run the guard CLI in a hermetic environment (no inherited DATABASE_URL). */
function runGuard(args: string[], extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "test",
    DB_GUARD_NO_PROBE: "1",
    ...extraEnv,
  };
  const result = spawnSync(process.execPath, [GUARD, ...args], { cwd: TMP, env, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("db-guard: разбор строки подключения и защита секретов", () => {
  it("маскирует пароль и не печатает его", () => {
    const target = parseTarget("postgresql://courier:sup3rsecret@db.example.com:5432/courier_db");
    expect(target.ok).toBe(true);
    expect(target.masked).toBe("postgresql://courier:***@db.example.com:5432/courier_db");
    expect(target.masked).not.toContain("sup3rsecret");
    expect(target.isLoopback).toBe(false);
  });

  it("loopback распознаётся, удалённый хост — нет", () => {
    expect(parseTarget("postgresql://u:p@localhost:5432/courier_test").isLoopback).toBe(true);
    expect(parseTarget("postgresql://u:p@127.0.0.1:5432/courier_test").isLoopback).toBe(true);
    expect(parseTarget("postgresql://u:p@postgres:5432/courier_db").isLoopback).toBe(false);
  });

  it("sanitize вычищает пароль и URL-креденшелы из текста ошибки", () => {
    const url = "postgresql://courier:sup3rsecret@127.0.0.1:5432/courier_test";
    const text = sanitize(`connect failed for ${url} password=sup3rsecret`, [url]);
    expect(text).not.toContain("sup3rsecret");
    expect(text).toContain("***");
  });
});

describe("db-guard: fail-closed классификация цели", () => {
  it("по умолчанию запрещает: допустимая на вид цель разрешается только с подтверждением", () => {
    expect(classifyTarget({ ...base, ack: null }).code).toBe("NO_ACK");
    expect(classifyTarget({ ...base, ack: "yes" }).code).toBe("NO_ACK");
    expect(classifyTarget(base).decision).toBe("ALLOW");
  });

  it("отсутствие конфигурации блокируется", () => {
    expect(classifyTarget({ ...base, databaseUrl: undefined }).code).toBe("NO_CONFIG");
    expect(classifyTarget({ ...base, databaseUrl: "" }).code).toBe("NO_CONFIG");
    expect(classifyTarget({ ...base, databaseUrl: "not-a-url" }).code).toBe("NO_CONFIG");
    expect(classifyTarget({ ...base, databaseUrl: "mysql://u:p@localhost:3306/db_test" }).code).toBe("NO_CONFIG");
  });

  it("NODE_ENV=production блокирует даже идеальную локальную цель", () => {
    const decision = classifyTarget({ ...base, nodeEnv: "production" });
    expect(decision.decision).toBe("DENY");
    expect(decision.code).toBe("NODE_ENV_PRODUCTION");
  });

  it("NODE_ENV=development не снимает запрет для production-подобной цели", () => {
    expect(classifyTarget({ ...base, nodeEnv: "development", databaseUrl: REMOTE_URL }).code).toBe("REMOTE_HOST");
    const fp = cleanProbe(65);
    fp.fingerprint.hasBillingDocuments = true;
    expect(classifyTarget({ ...base, nodeEnv: "development", probe: fp }).code).toBe("PRODUCTION_FINGERPRINT");
  });

  it("неизвестная/недоступная/неоднозначная цель блокируется", () => {
    expect(classifyTarget({ ...base, probe: { attempted: false } }).code).toBe("TARGET_UNVERIFIED");
    expect(classifyTarget({ ...base, probe: null }).code).toBe("TARGET_UNVERIFIED");
    expect(classifyTarget({ ...base, probe: { attempted: true, connected: false } }).code).toBe("TARGET_UNREACHABLE");
    const ambiguous = cleanProbe();
    ambiguous.fingerprint.tableCount = null;
    expect(classifyTarget({ ...base, probe: ambiguous }).code).toBe("TARGET_AMBIGUOUS");
  });

  it("production-отпечаток в БД блокируется, даже если имя БД выглядит тестовым", () => {
    const fp = cleanProbe(12);
    fp.fingerprint.hasCorrespondenceShipments = true;
    expect(classifyTarget({ ...base, probe: fp }).code).toBe("PRODUCTION_FINGERPRINT");
    expect(classifyTarget({ ...base, probe: cleanProbe(25) }).code).toBe("PRODUCTION_FINGERPRINT");
  });

  it("удалённый хост блокируется независимо от имени БД", () => {
    expect(classifyTarget({ ...base, databaseUrl: REMOTE_URL }).code).toBe("REMOTE_HOST");
    expect(classifyTarget({ ...base, databaseUrl: "postgresql://courier:p@postgres:5432/courier_test" }).code).toBe("REMOTE_HOST");
  });

  it("локальная, но не одноразовая БД блокируется", () => {
    expect(classifyTarget({ ...base, databaseUrl: "postgresql://courier:p@127.0.0.1:5432/courier_db" }).code)
      .toBe("NON_DISPOSABLE_DATABASE");
  });

  it("наличие production env-файлов блокирует", () => {
    expect(classifyTarget({ ...base, productionEnvFiles: [".env.deepseek"] }).code).toBe("PRODUCTION_ENV_CONTEXT");
    expect(classifyTarget({ ...base, productionEnvFiles: [".env.production"] }).code).toBe("PRODUCTION_ENV_CONTEXT");
  });

  it("разрешение возможно только для loopback + одноразового имени + чистого отпечатка + подтверждения", () => {
    const decision = classifyTarget({ ...base, databaseUrl: "postgresql://courier:p@localhost:5432/app_dev" });
    expect(decision.decision).toBe("ALLOW");
    expect(decision.code).toBe("LOCAL_DISPOSABLE");
  });
});

describe("db-guard: CLI", () => {
  it("без конфигурации отказывает, ничего не выполняя", () => {
    const { status, stdout, stderr } = runGuard(["push", "--print-decision"]);
    expect(status).toBe(1);
    expect(stdout).toContain("DENY");
    expect(stdout).toContain("NO_CONFIG");
    expect(stdout).not.toContain("target accepted");
    expect(stderr).toContain("REFUSED");
  });

  it("production-URL отказывает и не печатает пароль", () => {
    const secret = "sup3rsecretvalue";
    const { status, stdout, stderr } = runGuard(["push", "--print-decision"], {
      DATABASE_URL: `postgresql://courier:${secret}@db.example.com:5432/courier_db`,
      NODE_ENV: "production",
    });
    expect(status).toBe(1);
    const combined = stdout + stderr;
    expect(combined).toContain("DENY");
    expect(combined).toContain("courier:***@");
    expect(combined).not.toContain(secret);
  });

  it("локальная БД с неодноразовым именем отказывает (NODE_ENV=development не помогает)", () => {
    const { status, stdout } = runGuard(["push", "--print-decision"], {
      DATABASE_URL: "postgresql://courier:pw@127.0.0.1:5432/courier_db",
      NODE_ENV: "development",
      DB_GUARD_ACK: ACK_TOKEN,
    });
    expect(status).toBe(1);
    // DB_GUARD_NO_PROBE=1 means the target is unverified → deny before the name check.
    expect(stdout).toMatch(/TARGET_UNVERIFIED|NON_DISPOSABLE_DATABASE/);
  });

  it("неизвестная команда — код 2, справка — код 0", () => {
    expect(runGuard(["drop-everything"]).status).toBe(2);
    const help = runGuard(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("fail-closed");
  });

  it("db:push и db:migrate в package.json ведут через guard, а start — нет", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["db:push"]).toContain("scripts/db-guard.mjs push");
    expect(pkg.scripts["db:migrate"]).toContain("scripts/db-guard.mjs migrate");
    expect(pkg.scripts["db:guard:status"]).toContain("--print-decision");
    expect(pkg.scripts.start).not.toContain("db-guard");
    expect(pkg.scripts["build:backend"]).not.toContain("db-guard");
  });

  it("обычный запуск API не зависит от guard", () => {
    const entrypoint = fs.readFileSync(path.join(REPO, "entrypoint.sh"), "utf8");
    expect(entrypoint).toContain("exec node dist/index.js");
    expect(entrypoint).not.toContain("db-guard");
    const startLine = entrypoint.split("\n").find((line) => line.includes("exec node dist/index.js")) ?? "";
    expect(startLine).toContain("exec node dist/index.js");
  });
});

describe("db-guard: проверка разрешений ничего не пишет", () => {
  it("в коде guard нет ни одной пишущей SQL-команды", () => {
    const source = fs.readFileSync(GUARD, "utf8");
    const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutBlockComments).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/i);
    expect(source).toContain("BEGIN READ ONLY");
    expect(source).toContain("default_transaction_read_only = on");
    expect(source).toContain("to_regclass");
    expect(source).toContain("ROLLBACK");
  });
});
