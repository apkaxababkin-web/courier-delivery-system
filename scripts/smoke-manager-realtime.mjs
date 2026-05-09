#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || 'http://localhost:3000';

async function fetchSnapshot() {
  const response = await fetch(`${baseUrl}/api/realtime/manager`, {
    headers: {
      accept: 'application/json',
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || data?.ok === false) {
    console.error('Realtime manager snapshot failed');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  if (!Array.isArray(data.tasks)) {
    console.error('Invalid tasks payload');
    process.exit(1);
  }

  if (!Array.isArray(data.requests)) {
    console.error('Invalid requests payload');
    process.exit(1);
  }

  if (!Array.isArray(data.mails)) {
    console.error('Invalid mails payload');
    process.exit(1);
  }

  console.log(`OK realtime snapshot tasks=${data.tasks.length} requests=${data.requests.length} mails=${data.mails.length}`);
}

await fetchSnapshot();
await new Promise((resolve) => setTimeout(resolve, 2000));
await fetchSnapshot();

console.log('Manager realtime polling smoke passed');
