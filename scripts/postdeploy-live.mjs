#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || process.argv[2];

if (!baseUrl) {
  console.error('Missing production URL');
  process.exit(1);
}

const steps = [
  ['Production verification', 'pnpm', ['verify:production']],
  ['Live smoke', 'pnpm', ['smoke:live']],
];

function run(label, command, args) {
  console.log(`RUN ${label}`);

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
    console.error(`FAIL ${label}`);
    process.exit(result.status || 1);
  }

  console.log(`OK ${label}`);
}

for (const [label, command, args] of steps) {
  run(label, command, args);
}

console.log(`Production rollout verification passed for ${baseUrl}`);
