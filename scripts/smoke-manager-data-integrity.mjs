#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || process.env.APP_URL || 'http://localhost:3000';

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function assertArray(name, value) {
  if (!Array.isArray(value)) {
    console.error(`FAIL ${name}: expected array`);
    process.exit(1);
  }
}

function assertNoDuplicateIds(name, rows) {
  const ids = rows.map((row) => row?.id).filter((id) => id !== undefined && id !== null);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    console.error(`FAIL ${name}: duplicate ids detected`);
    process.exit(1);
  }
}

function assertTaskShape(tasks) {
  for (const task of tasks) {
    if (!task.id || !task.status) {
      console.error('FAIL tasks: invalid task payload');
      console.error(JSON.stringify(task, null, 2));
      process.exit(1);
    }
  }
}

function assertRequestShape(requests) {
  for (const request of requests) {
    if (!request.id || !request.status || !request.requestType) {
      console.error('FAIL requests: invalid request payload');
      console.error(JSON.stringify(request, null, 2));
      process.exit(1);
    }
  }
}

function assertMailShape(mails) {
  for (const mail of mails) {
    if (!mail.id || !mail.waybillNumber || !mail.status) {
      console.error('FAIL mails: invalid mail payload');
      console.error(JSON.stringify(mail, null, 2));
      process.exit(1);
    }
  }
}

const response = await fetch(`${baseUrl}/api/realtime/manager`, {
  headers: { accept: 'application/json' },
});

const snapshot = await readJson(response);

if (!response.ok || snapshot?.ok === false) {
  console.error('FAIL manager realtime snapshot');
  console.error(JSON.stringify(snapshot, null, 2));
  process.exit(1);
}

assertArray('tasks', snapshot.tasks);
assertArray('requests', snapshot.requests);
assertArray('mails', snapshot.mails);
assertNoDuplicateIds('tasks', snapshot.tasks);
assertNoDuplicateIds('requests', snapshot.requests);
assertNoDuplicateIds('mails', snapshot.mails);
assertTaskShape(snapshot.tasks);
assertRequestShape(snapshot.requests);
assertMailShape(snapshot.mails);

console.log(`OK manager data integrity tasks=${snapshot.tasks.length} requests=${snapshot.requests.length} mails=${snapshot.mails.length}`);
