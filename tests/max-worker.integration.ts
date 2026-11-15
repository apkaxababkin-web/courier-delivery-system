import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { processMaxDelayedNotifications } from "../server/_core/maxDelayedNotifications";

const url = process.env.MAX_TEST_DATABASE_URL;
if (!url) throw new Error("MAX_TEST_DATABASE_URL is required");

const client = postgres(url, { max: 2, connect_timeout: 5 });
const db = drizzle(client);

const expectedPlaces = "📦 Заявка №36: курьер забрал 4 места.";
const expectedCompleted = "✅ Заявка №36 выполнена.";

async function queue(event: string, message: string) {
  await client`
    INSERT INTO max_delayed_notifications
      (draft_id,event_type,message,due_at,status)
    VALUES (36,${event},${message},now()-interval '1 minute','pending')
  `;
}

async function reset() {
  await client`TRUNCATE max_delayed_notifications RESTART IDENTITY`;
}

async function run() {
  try {
    await client`SELECT 1`;

    // 1. Independent events.
    await reset();
    await queue("places", expectedPlaces);
    await queue("completed", expectedCompleted);

    const sent: string[] = [];
    await processMaxDelayedNotifications(
      async (_chat, message) => { sent.push(message); },
      db as any,
    );

    if (sent.length !== 2 ||
        !sent.includes(expectedPlaces) ||
        !sent.includes(expectedCompleted)) {
      throw new Error("Independent delivery failed: " + JSON.stringify(sent));
    }

    const delivered = await client`
      SELECT status FROM max_delayed_notifications
    `;
    if (delivered.some(row => row.status !== "sent")) {
      throw new Error("Delivered notifications were not marked sent");
    }
    console.log("PASS: places and completion delivered independently");

    // 2. Network error must retain notification.
    await reset();
    await queue("completed", expectedCompleted);

    await processMaxDelayedNotifications(
      async () => { throw new Error("SIMULATED_MAX_NETWORK_FAILURE"); },
      db as any,
    );

    const failed = await client`
      SELECT status,attempts,due_at > now() AS scheduled
      FROM max_delayed_notifications
    `;
    if (failed.length !== 1 ||
        failed[0].status !== "pending" ||
        !failed[0].scheduled ||
        failed[0].attempts !== 1) {
      throw new Error("Retry state invalid: " + JSON.stringify(failed));
    }
    console.log("PASS: network failure scheduled a retry");

    // 3. Simulate passage of retry interval.
    await client`
      UPDATE max_delayed_notifications
      SET due_at=now()-interval '1 second'
      WHERE status='pending'
    `;

    const retried: string[] = [];
    await processMaxDelayedNotifications(
      async (_chat, message) => { retried.push(message); },
      db as any,
    );

    const recovered = await client`
      SELECT status,attempts FROM max_delayed_notifications
    `;
    if (retried.length !== 1 ||
        retried[0] !== expectedCompleted ||
        recovered[0].status !== "sent" ||
        recovered[0].attempts !== 2) {
      throw new Error("Retry delivery failed");
    }
    console.log("PASS: retry delivered successfully");

    // 4. Recover a stale sending record.
    await reset();
    await queue("completed", expectedCompleted);
    await client`
      UPDATE max_delayed_notifications
      SET status='sending',
          attempts=1,
          updated_at=now()-interval '6 minutes'
    `;

    const restored: string[] = [];
    await processMaxDelayedNotifications(
      async (_chat, message) => { restored.push(message); },
      db as any,
    );

    const final = await client`
      SELECT status,attempts FROM max_delayed_notifications
    `;
    if (restored.length !== 1 ||
        restored[0] !== expectedCompleted ||
        final[0].status !== "sent" ||
        final[0].attempts !== 2) {
      throw new Error("Stale sending recovery failed");
    }
    console.log("PASS: stale sending recovered");


    // 5. A correction during sending must not cancel completion.
    await reset();
    await client`UPDATE requests SET status='completed', "placesCount"=5 WHERE id=100`;
    await queue("places", "📦 Заявка №36: курьер забрал 5 мест.");
    await queue("completed", expectedCompleted);

    const duringSend: string[] = [];
    let corrected = false;
    await processMaxDelayedNotifications(
      async (_chat, message) => {
        duringSend.push(message);
        if (message.includes("5 мест") && !corrected) {
          corrected = true;
          await client`UPDATE requests SET "placesCount"=4 WHERE id=100`;
          await client`
            INSERT INTO max_delayed_notifications
              (draft_id,event_type,message,due_at,status)
            VALUES
              (36,'places',${expectedPlaces},now()+interval '5 minutes','pending')
            ON CONFLICT (draft_id,event_type) WHERE status='pending'
            DO UPDATE SET message=EXCLUDED.message,
                          due_at=EXCLUDED.due_at,
                          updated_at=now()
          `;
        }
      },
      db as any,
    );

    const afterCorrection = await client`
      SELECT event_type,status FROM max_delayed_notifications
      ORDER BY id
    `;
    if (!duringSend.includes(expectedCompleted) ||
        !afterCorrection.some(row =>
          row.event_type === "places" && row.status === "pending"
        )) {
      throw new Error("Correction suppressed completion or lost new places event");
    }
    console.log("PASS: correction during sending preserves completion and new places event");

    console.log("ALL MAX WORKER INTEGRATION TESTS PASSED");
  } finally {
    await client.end();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
