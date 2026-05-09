#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const commands = [
  ['docker', ['compose', 'config']],
  ['docker', ['compose', 'build']],
];

for (const [command, args] of commands) {
  console.log(`RUN ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`FAIL ${command} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }

  console.log(`OK ${command} ${args.join(' ')}`);
}

console.log('Docker runtime smoke passed');
