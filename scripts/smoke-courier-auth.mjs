#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || 'http://localhost:3000';

async function safeJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function fail(message, payload) {
  console.error(`FAIL ${message}`);
  if (payload) console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

const loginResponse = await fetch(`${baseUrl}/api/trpc/courierAuth.login`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json',
  },
  body: JSON.stringify({
    json: {
      username: process.env.SMOKE_COURIER_USERNAME || 'demo',
      password: process.env.SMOKE_COURIER_PASSWORD || 'demo123',
    },
  }),
});

const loginPayload = await safeJson(loginResponse);

if (loginResponse.status >= 500) {
  fail('courierAuth.login server error', loginPayload);
}

const token = loginPayload?.result?.data?.json?.token;

if (token) {
  const realtimeResponse = await fetch(`${baseUrl}/api/realtime/courier?token=${encodeURIComponent(token)}`, {
    headers: { accept: 'application/json' },
  });

  const realtimePayload = await safeJson(realtimeResponse);

  if (realtimeResponse.status >= 500) {
    fail('courier realtime server error', realtimePayload);
  }

  if (!Array.isArray(realtimePayload?.tasks)) {
    fail('courier realtime invalid tasks payload', realtimePayload);
  }

  if (!Array.isArray(realtimePayload?.mails)) {
    fail('courier realtime invalid mails payload', realtimePayload);
  }
}

console.log('OK courier auth smoke passed');
