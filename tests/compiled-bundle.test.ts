/**
 * Regression guard for the compiled backend bundle.
 *
 * Why this exists: TypeScript and Vitest both run the *sources*, where
 * `__dirname` is available. The production backend, however, is an esbuild bundle
 * executed by Node as an ES module, where `__dirname`/`__filename` do not exist.
 * The previous release therefore built successfully and only failed at container
 * startup with:
 *
 *   ReferenceError: __dirname is not defined in ES module scope
 *
 * The tests below run the real bundle in an ESM-only layout (bundle in `dist/`,
 * fonts in `dist/assets/fonts`, no `package.json` type hint), exactly like the
 * Docker image, so this class of bug cannot reach production again.
 */
import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const BUNDLE = path.join(REPO_ROOT, "dist", "index.js");
const CJS_GLOBALS = /\b__(dirname|filename)\b/;

/** The build script copies server/assets into dist/assets. */
function ensureBundle(): void {
  if (!fs.existsSync(BUNDLE)) {
    const built = spawnSync("pnpm", ["run", "build:backend"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
    if (built.status !== 0) {
      throw new Error(`build:backend failed\n${built.stdout}\n${built.stderr}`);
    }
  }
  expect(fs.existsSync(BUNDLE)).toBe(true);
}

/**
 * Lay the compiled output out the way the image does: bundle and assets together,
 * without any `package.json`, so Node has to treat it as an ES module exactly as
 * it does in production.
 */
function dockerLikeLayout(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "courier-bundle-"));
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.copyFileSync(BUNDLE, path.join(root, "dist", "index.js"));
  fs.cpSync(path.join(REPO_ROOT, "dist", "assets"), path.join(root, "dist", "assets"), { recursive: true });
  // The image has its node_modules at the application root; mirror that so the
  // bundle can resolve its external packages (the bundle itself is unchanged).
  fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(root, "node_modules"), "dir");
  return root;
}

interface StartupResult {
  /** True when the message we were waiting for actually appeared. */
  matched: boolean;
  /** True when the process was still alive after the observation window. */
  stillRunning: boolean;
  exitCode: number | null;
  output: string;
}

const CRASH_SIGNS = [
  "__dirname is not defined",
  "__filename is not defined",
  "Не найден каталог шрифтов",
];

/**
 * Start the real bundle with no database and watch its output.
 *
 * The `__dirname` crash happens while the bundle is initialised, i.e. before the
 * server can listen, so we either observe a crash signature or the listening line.
 * The process is stopped as soon as one of them appears, so the test does not wait
 * for the timeout.
 */
function startBundle(
  bundlePath: string,
  until: RegExp,
  timeoutMs = 30_000,
  extraEnv: Record<string, string> = {},
): Promise<StartupResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bundlePath], {
      cwd: path.dirname(bundlePath),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        PORT: "0",
        API_PORT: "0",
        // No DATABASE_URL on purpose: the server must still reach "listening".
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let settled = false;
    const finish = (matched: boolean, stillRunning: boolean, exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stillRunning) child.kill("SIGKILL");
      resolve({ matched, stillRunning, exitCode, output });
    };

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (until.test(output)) return finish(true, true, null);
      if (CRASH_SIGNS.some((sign) => output.includes(sign))) return finish(false, child.exitCode === null, child.exitCode);
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => finish(until.test(output), false, code));

    const timer = setTimeout(() => finish(until.test(output), true, null), timeoutMs);
  });
}

describe("compiled backend bundle (ESM runtime)", () => {
  it("the smoke helper actually catches the original __dirname crash", async () => {
    // Negative control: a tiny ES module that does exactly what the released
    // bundle did. It guarantees the checks below cannot pass vacuously.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "courier-bundle-control-"));
    try {
      const broken = path.join(root, "index.js");
      fs.writeFileSync(
        broken,
        'import path from "node:path";\nconst dir = path.join(__dirname, "..", "assets", "fonts");\nconsole.log(dir);\n',
      );
      const result = await startBundle(broken, /never-matches/, 15_000);

      expect(result.output).toMatch(/ReferenceError/);
      expect(result.output).toMatch(/__dirname is not defined in ES module scope/);
      expect(result.matched).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("does not contain __dirname or __filename", () => {
    ensureBundle();
    const bundle = fs.readFileSync(BUNDLE, "utf8");
    const match = bundle.match(CJS_GLOBALS);
    expect(match?.[0] ?? null).toBeNull();
    // The ESM-safe replacement must actually be present.
    expect(bundle).toContain("import.meta.url");
  });

  it("starts from a Docker-like layout without ReferenceError", async () => {
    ensureBundle();
    const root = dockerLikeLayout();
    try {
      const result = await startBundle(path.join(root, "dist", "index.js"), /server listening on port/);

      // The exact regression: module-scope access to a CommonJS global.
      expect(result.output).not.toMatch(/ReferenceError/);
      expect(result.output).not.toMatch(/__dirname is not defined/);
      expect(result.output).not.toMatch(/__filename is not defined/);
      expect(result.output).not.toMatch(/Не найден каталог шрифтов/);
      expect(result.matched).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("resolves the PDF fonts next to the bundle, as the image does", async () => {
    ensureBundle();
    const root = dockerLikeLayout();
    try {
      const bundle = path.join(root, "dist", "index.js");
      // The probe makes the compiled bundle print its own resolved paths and stop,
      // so this asserts the real runtime value, not a re-implementation of it.
      const probe = await startBundle(bundle, /"probe":"pdf-fonts"/, 20_000, { PDF_FONTS_PROBE: "1" });
      const line = probe.output.split("\n").find((row) => row.includes('"probe":"pdf-fonts"'));
      expect(line).toBeTruthy();
      const resolved = JSON.parse(line as string) as {
        moduleUrl: string;
        fontDir: string;
        regular: string;
        bold: string;
        regularExists: boolean;
        boldExists: boolean;
      };

      // This is what the Docker image produces: /app/dist/index.js -> /app/dist/assets/fonts.
      const expectedDir = path.join(root, "dist", "assets", "fonts");
      expect(resolved.moduleUrl).toBe(`file://${bundle}`);
      expect(resolved.fontDir).toBe(expectedDir);
      expect(resolved.regular).toBe(path.join(expectedDir, "LiberationSerif-Regular.ttf"));
      expect(resolved.bold).toBe(path.join(expectedDir, "LiberationSerif-Bold.ttf"));
      expect(resolved.regularExists).toBe(true);
      expect(resolved.boldExists).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("is refused loudly when the fonts directory is missing", async () => {
    ensureBundle();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "courier-bundle-broken-"));
    try {
      fs.mkdirSync(path.join(root, "dist"), { recursive: true });
      fs.copyFileSync(BUNDLE, path.join(root, "dist", "index.js"));
      fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(root, "node_modules"), "dir");
      // No dist/assets: the server must fail with a clear message, never silently.
      const result = await startBundle(path.join(root, "dist", "index.js"), /server listening on port/, 20_000);
      expect(result.output).toMatch(/Не найден каталог шрифтов/);
      expect(result.output).not.toMatch(/ReferenceError/);
      expect(result.matched).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 45_000);
});
