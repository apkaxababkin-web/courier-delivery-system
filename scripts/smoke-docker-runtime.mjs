#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const runRuntime = process.env.SMOKE_DOCKER_UP === '1';
const compose = process.env.COMPOSE_CMD || 'docker compose';

function run(label, command, args) {
  console.log(`RUN ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`FAIL ${label}`);
    process.exit(result.status || 1);
  }

  console.log(`OK ${label}`);
}

function composeRun(label, args) {
  run(label, compose, args);
}

composeRun('docker compose config', ['config']);
composeRun('docker compose build', ['build']);

if (runRuntime) {
  try {
    composeRun('docker compose up', ['up', '-d', '--remove-orphans']);

    console.log('RUN docker compose health wait');
    for (let attempt = 1; attempt <= 40; attempt += 1) {
      const response = await fetch('http://127.0.0.1:3000/api/health').catch(() => null);
      if (response?.ok) {
        const data = await response.json().catch(() => ({}));
        if (data?.ok) {
          console.log('OK docker compose health wait');
          break;
        }
      }

      if (attempt === 40) {
        run('docker compose logs api', compose, ['logs', '--tail=200', 'api']);
        console.error('FAIL docker compose health wait');
        process.exit(1);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } finally {
    if (process.env.SMOKE_DOCKER_KEEP_UP !== '1') {
      composeRun('docker compose down', ['down']);
    }
  }
}

console.log('Docker runtime smoke passed');
