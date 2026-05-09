#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || 'http://localhost:3000';

const routes = [
  '/api/trpc/manager.couriers',
  '/api/trpc/tasks.all',
  '/api/trpc/mails.notDelivered',
  '/api/trpc/managerMails.all',
  '/api/trpc/requests.all',
];

async function verify(route) {
  const separator = route.includes('?') ? '&' : '?';
  const response = await fetch(`${baseUrl}${route}${separator}input={}`);

  const text = await response.text();

  if (!response.ok) {
    console.error(`FAIL ${route}`);
    console.error(text);
    process.exit(1);
  }

  console.log(`OK ${route}`);
}

for (const route of routes) {
  await verify(route);
}

console.log('TRPC compatibility smoke passed');
