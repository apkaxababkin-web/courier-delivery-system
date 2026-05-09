#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || process.argv[2];

if (!baseUrl) {
  console.error('Missing production URL. Usage: SMOKE_BASE_URL=https://example.com pnpm verify:production');
  process.exit(1);
}

const checks = [
  ['health', async () => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(`health failed: ${response.status}`);
  }],
  ['auth/session', () => run('pnpm', ['smoke:auth'])],
  ['trpc routes', () => run('pnpm', ['smoke:trpc'])],
  ['manager realtime', () => run('pnpm', ['smoke:manager'])],
  ['manager data integrity', () => run('pnpm', ['smoke:manager:data'])],
];

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      SMOKE_BASE_URL: baseUrl,
      APP_URL: baseUrl,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

for (const [name, check] of checks) {
  try {
    console.log(`RUN ${name}`);
    await check();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

console.log(`Production verification passed for ${baseUrl}`);
