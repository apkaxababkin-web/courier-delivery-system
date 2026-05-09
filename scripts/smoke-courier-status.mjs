#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || 'http://localhost:3000';
const token = process.env.COURIER_TOKEN;
const taskId = Number(process.env.SMOKE_TASK_ID || 0);

if (!token) {
  console.error('Missing COURIER_TOKEN');
  process.exit(1);
}

if (!taskId) {
  console.error('Missing SMOKE_TASK_ID');
  process.exit(1);
}

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ json: body }),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || data?.error) {
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  return data;
}

await request('/api/trpc/tasks.setStatus', {
  token,
  taskId,
  status: 'in_progress',
});

console.log('OK task -> in_progress');

await request('/api/trpc/tasks.setStatus', {
  token,
  taskId,
  status: 'completed',
});

console.log('OK task -> completed');

await request('/api/trpc/tasks.setStatus', {
  token,
  taskId,
  status: 'assigned',
});

console.log('OK task reverted -> assigned');
