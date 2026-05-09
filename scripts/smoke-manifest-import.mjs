#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || 'http://localhost:3000';

async function parse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function verify(name, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ json: body }),
  });

  const data = await parse(response);

  if (!response.ok) {
    console.error(`FAIL ${name}`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(`OK ${name}`);
  return data;
}

await verify('manager mail create', '/api/trpc/managerMails.create', {
  waybillNumber: `SMOKE-${Date.now()}`,
  recipientName: 'Smoke Test',
  recipientPhone: '+70000000000',
  deliveryAddress: 'Smoke street',
});

await verify('request create', '/api/trpc/requests.create', {
  requestType: 'delivery',
  recipientName: 'Smoke Request',
  recipientPhone: '+70000000001',
  deliveryAddress: 'Realtime avenue',
  packageDescription: 'Smoke package',
});

console.log('Manifest/request smoke checks passed');
