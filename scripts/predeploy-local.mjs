#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const steps = [
  ['TypeScript check', 'pnpm', ['check']],
  ['Production local smoke', 'pnpm', ['smoke:local']],
];

function run(label, command, args) {
  console.log(`RUN ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
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

console.log('Local predeploy verification passed');
