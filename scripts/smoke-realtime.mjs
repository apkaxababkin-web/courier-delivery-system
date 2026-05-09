#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || 'http://localhost:3000';
const courierToken = process.env.COURIER_TOKEN || '';

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function check(name, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await readJson(response);
  const ok = response.ok && !data?.error;
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}: ${response.status}`);
  if (!ok) {
    console.error(JSON.stringify(data, null, 2));
    process.exitCode = 1;
  }
  return data;
}

await check('health', '/api/health');
await check('manager couriers compatibility', '/api/trpc/manager.couriers');

if (courierToken) {
  await check('courier tasks realtime source', `/api/trpc/tasks.all?input=${encodeURIComponent(JSON.stringify({ token: courierToken }))}`);
  await check('courier mails realtime source', `/api/trpc/mails.notDelivered?input=${encodeURIComponent(JSON.stringify({ token: courierToken }))}`);
} else {
  console.log('SKIP courier realtime checks: set COURIER_TOKEN');
}

if (process.exitCode) {
  throw new Error('Smoke realtime checks failed');
}
