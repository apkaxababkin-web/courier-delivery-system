/**
 * Isolated tests for `courier-manager/entrypoint.sh` (Stage A.1).
 *
 * Nothing here touches PostgreSQL, Docker or production configuration:
 *   * the static checks read the script text;
 *   * the runtime check replaces `psql` and `node` with stubs through PATH, so the
 *     entrypoint's readiness loop succeeds immediately and the "application" is a
 *     throwaway script that records its arguments and how it received SIGTERM.
 * The synthetic DATABASE_URL used below is fake; no real connection string is read.
 */
import { afterAll, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(__dirname, "..");
const ENTRYPOINT = path.join(REPO, "courier-manager", "entrypoint.sh");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cm-entrypoint-"));
const FAKE_PASSWORD = "stubpw-should-never-be-logged";
const FAKE_URL = `postgresql://stubuser:${FAKE_PASSWORD}@127.0.0.1:5499/stub_test`;

const source = fs.readFileSync(ENTRYPOINT, "utf8");

/** Lines that actually execute (comments and blank lines removed). */
const commandLines = source
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("courier-manager/entrypoint.sh: статические проверки", () => {
  it("синтаксически корректен", () => {
    const result = spawnSync("sh", ["-n", ENTRYPOINT], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("не запускает drizzle-kit push и не обходит db-guard", () => {
    const joined = commandLines.join("\n");
    expect(joined).not.toMatch(/drizzle-kit\s+push/);
    expect(joined).not.toMatch(/drizzle-kit\s+(migrate|generate)/);
    expect(joined).not.toMatch(/npx\s+drizzle-kit/);
    expect(joined).not.toMatch(/db:push/);
    // db-guard must not be re-implemented or bypassed here either
    expect(joined).not.toMatch(/db-guard/);
  });

  it("не вызывает db:migrate и не выполняет DDL", () => {
    const joined = commandLines.join("\n");
    expect(joined).not.toMatch(/db:migrate/);
    expect(joined).not.toMatch(/\b(pnpm|npm|yarn)\s+run\s+db:/);
    expect(joined).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE)\b/);
    expect(joined).not.toMatch(/psql[^\n]*(-c|-f)[^\n]*(CREATE|ALTER|DROP)/i);
  });

  it("не печатает DATABASE_URL, пароли и окружение", () => {
    const joined = commandLines.join("\n");
    expect(joined).not.toMatch(/echo[^\n]*DATABASE_URL/);
    expect(joined).not.toMatch(/echo[^\n]*\$PGPASSWORD/);
    expect(joined).not.toMatch(/\b(printenv|env)\b/);
    expect(joined).not.toMatch(/set\s+-x/);
    expect(joined).not.toMatch(/set\s+-o\s+xtrace/);
    expect(source.split("\n")[0]).not.toMatch(/-x/);
    // the only allowed mention of the variable is the psql argument, output suppressed
    const psqlLines = commandLines.filter((line) => line.includes("DATABASE_URL"));
    expect(psqlLines).toEqual(['if psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then']);
  });

  it("сохраняет обычную команду запуска приложения и её аргументы", () => {
    const execLines = commandLines.filter((line) => line.startsWith("exec "));
    expect(execLines).toEqual(["exec node dist/index.js"]);
    expect(commandLines[commandLines.length - 1]).toBe("exec node dist/index.js");
  });

  it("не содержит способов включить миграцию через переменные окружения", () => {
    const joined = source.replace(/^#.*$/gm, "");
    for (const flag of ["RUN_DB_PUSH", "RUN_DB_PATCHES", "ALLOW_", "FORCE_MIGRATE", "SKIP_MIGRATE"]) {
      expect(joined).not.toContain(flag);
    }
  });
});

describe("courier-manager/entrypoint.sh: безопасный запуск со стабами", () => {
  it("запускает приложение, не выполняя миграций, и передаёт ему SIGTERM", async () => {
    const bin = path.join(TMP, "bin");
    fs.mkdirSync(bin, { recursive: true });
    const startedFile = path.join(TMP, "node-started");
    const termFile = path.join(TMP, "node-got-term");

    // Stub `psql`: the readiness probe always succeeds (no database is contacted).
    fs.writeFileSync(
      path.join(bin, "psql"),
      "#!/bin/sh\n# stub: never contacts a database\nexit 0\n",
      { mode: 0o755 },
    );
    // Stub `node`: records the arguments it was exec'd with, then waits for SIGTERM.
    fs.writeFileSync(
      path.join(bin, "node"),
      `#!/bin/sh
printf '%s\\n' "$*" > "${startedFile}"
trap 'printf "terminated\\n" > "${termFile}"; exit 0' TERM
while :; do sleep 0.1; done
`,
      { mode: 0o755 },
    );

    // Stubs first (psql/node), system dirs kept so the stub application can use `sleep`.
    const env: NodeJS.ProcessEnv = {
      PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      DATABASE_URL: FAKE_URL,
      NODE_ENV: "test",
    };
    const child = spawn("sh", [ENTRYPOINT], { cwd: TMP, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });

    // Wait until the stubbed application has been started (exec replaced the shell).
    for (let i = 0; i < 100 && !fs.existsSync(startedFile); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(fs.existsSync(startedFile)).toBe(true);
    expect(fs.readFileSync(startedFile, "utf8").trim()).toBe("dist/index.js");

    // Subscribe before signalling: the stub may exit before we would attach later.
    const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));

    // Signals must reach the application itself (the `exec` contract).
    child.kill("SIGTERM");
    for (let i = 0; i < 100 && !fs.existsSync(termFile); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(fs.existsSync(termFile)).toBe(true);

    await exited;

    // No credentials may appear in the container output.
    expect(output).not.toContain(FAKE_PASSWORD);
    expect(output).not.toContain(FAKE_URL);
    expect(output).not.toContain("127.0.0.1:5499");
    expect(output).toContain("Starting courier-manager API");
    // No migration-related output at all.
    expect(output.toLowerCase()).not.toContain("migration");
    expect(output.toLowerCase()).not.toContain("drizzle");
  });
});
