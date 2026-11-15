import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { processMaxDecisionDeliveries } from '../server/_core/maxDelayedNotifications';

const url = process.env.MAX_TEST_DATABASE_URL;
if (!url) throw new Error('MAX_TEST_DATABASE_URL missing');
const client = postgres(url, {max: 2, connect_timeout: 5});
const conn = drizzle(client);
const msg = '✅ Заявка №36 принята в работу.';
const assert = (ok: unknown, description: string) => {if (!ok) throw new Error(description);};

async function reset() {
  await client`TRUNCATE max_decision_deliveries RESTART IDENTITY`;
  await client`UPDATE max_order_drafts SET status='approved' WHERE id=36`;
}
async function enqueue() {
  await client`INSERT INTO max_decision_deliveries(draft_id,event_type,destination,chat_id,message)
    VALUES (36,'approved','client','123456',${msg}),(36,'approved','manager','987654',${msg})`;
}
async function run() {
  try {
    await reset(); await enqueue();
    const sent: string[] = [];
    await processMaxDecisionDeliveries(async (chat, text) => {sent.push(chat+':'+text)}, conn as any);
    assert(sent.length===2 && sent.some(x=>x.startsWith('123456:')) && sent.some(x=>x.startsWith('987654:')), 'both recipients not delivered');
    const statuses = await client`SELECT status FROM max_decision_deliveries`;
    assert(statuses.every(x=>x.status==='sent'), 'not all marked sent');
    console.log('PASS: immediate two-recipient delivery');

    await reset(); await enqueue();
    const attempts: string[] = [];
    await processMaxDecisionDeliveries(async (chat) => {attempts.push(chat); if(chat==='987654') throw Error('SIMULATED_MANAGER_FAILURE')}, conn as any);
    const states = await client`SELECT destination,status,attempts,due_at>now() AS delayed FROM max_decision_deliveries ORDER BY destination`;
    assert(states[0].destination==='client' && states[0].status==='sent' && states[0].attempts===1,'client should be sent');
    assert(states[1].destination==='manager' && states[1].status==='pending' && states[1].attempts===1 && states[1].delayed,'manager retry not scheduled');
    await client`UPDATE max_decision_deliveries SET due_at=now()-interval '1 second' WHERE destination='manager'`;
    const retried: string[]=[];
    await processMaxDecisionDeliveries(async chat=>{retried.push(chat)},conn as any);
    assert(retried.length===1 && retried[0]==='987654','retry should target manager only');
    const finalStates=await client`SELECT status,attempts FROM max_decision_deliveries ORDER BY destination`;
    assert(finalStates[0].status==='sent' && finalStates[0].attempts===1 && finalStates[1].status==='sent' && finalStates[1].attempts===2,'incorrect final retry state');
    console.log('PASS: independent retry, no duplicate client delivery');

    await reset(); await enqueue();
    await client`UPDATE max_order_drafts SET status='rejected' WHERE id=36`;
    let count=0;
    await processMaxDecisionDeliveries(async()=>{count++},conn as any);
    assert(count===0,'mismatched draft should never send');
    const mismatch=await client`SELECT status FROM max_decision_deliveries`;
    assert(mismatch.every(x=>x.status==='failed'),'mismatch not marked failed');
    console.log('PASS: draft status mismatch prevents delivery');
    console.log('ALL DECISION DELIVERY TESTS PASSED');
  } finally {await client.end()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
