#!/usr/bin/env node

import { spawn } from 'node:child_process';

const port = Number(process.env.SMOKE_PORT || 3999);
const baseUrl = `http://127.0.0.1:${port}`;
const timeoutMs = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS || 30000);

const child = spawn('node', ['dist/index.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
  },
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
  process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
  process.stderr.write(chunk);
});

function stop() {
  if (!child.killed) child.kill('SIGTERM');
}

async function waitForHealth() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await response.json();
      if (response.ok && data?.ok) return;
    } catch {
      // Server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Health endpoint did not become ready within ${timeoutMs}ms`);
}

try {
  await waitForHealth();
  console.log('OK production startup smoke passed');
} catch (error) {
  console.error('FAIL production startup smoke');
  console.error(error instanceof Error ? error.message : error);
  if (stdout) console.error(`stdout:\n${stdout}`);
  if (stderr) console.error(`stderr:\n${stderr}`);
  process.exitCode = 1;
} finally {
  stop();
}
