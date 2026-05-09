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
  if (payload) {
    console.error(JSON.stringify(payload, null, 2));
  }
  process.exit(1);
}

const healthResponse = await fetch(`${baseUrl}/api/health`);

if (!healthResponse.ok) {
  fail('health endpoint unavailable', {
    status: healthResponse.status,
  });
}

const meResponse = await fetch(`${baseUrl}/api/trpc/auth.me`, {
  headers: {
    accept: 'application/json',
  },
});

const mePayload = await safeJson(meResponse);

if (meResponse.status >= 500) {
  fail('auth.me returned server error', mePayload);
}

const logoutResponse = await fetch(`${baseUrl}/api/trpc/auth.logout`, {
  method: 'POST',
  headers: {
    accept: 'application/json',
  },
});

const logoutPayload = await safeJson(logoutResponse);

if (logoutResponse.status >= 500) {
  fail('auth.logout returned server error', logoutPayload);
}

const setCookie = logoutResponse.headers.get('set-cookie') || '';

if (logoutResponse.ok && !setCookie.includes('Max-Age=-1') && !setCookie.includes('Expires=')) {
  fail('logout does not clear session cookie');
}

console.log('OK auth/session smoke passed');
