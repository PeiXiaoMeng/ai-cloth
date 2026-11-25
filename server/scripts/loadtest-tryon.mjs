/**
 * Load test for the async try-on pipeline (mock mode, no real AI calls / no token cost).
 *
 * What it does:
 *   1. Creates N distinct mock users (WX_MOCK maps each login code to a distinct openid,
 *      which is required because the server allows only 1 in-flight task per user)
 *   2. Each user submits exactly one try-on task
 *   3. Polls every task and prints a status snapshot every 2 seconds
 *   4. Asserts PROCESSING never exceeds the worker concurrency cap
 *
 * Prerequisites:
 *   - Server running with WX_MOCK=true, DASHSCOPE_MOCK=true, DASHSCOPE_MOCK_DELAY=5000
 *   - Redis (Memurai) running
 *   - Node.js >= 18 (built-in fetch / FormData)
 *
 * Usage:
 *   node scripts/loadtest-tryon.mjs          # 10 users
 *   node scripts/loadtest-tryon.mjs 15       # 15 users
 *
 * Env overrides:
 *   BASE_URL=http://localhost:3000  CONCURRENCY=3  POLL_INTERVAL=2000
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Blob } from 'node:buffer';
import { baseline, pruneStale, cleanupRun, disconnect } from './loadtest-cleanup.mjs';

process.on('SIGINT', async () => {
  console.log('\n[interrupted] cleaning up test data ...');
  await pruneStale();
  await disconnect();
  process.exit(130);
});

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const USERS = Number(process.argv[2] || 10);
const CAP = Number(process.env.CONCURRENCY || 3);
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || 2000);
const MAX_WAIT_MS = 120000;
const IMAGE_PATH = fileURLToPath(new URL('../public/clothes/1.jpg', import.meta.url));
const runId = `lt-${Date.now()}`; // fresh users on every run, so quota never runs out

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(code) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`login failed (${res.status}) - is WX_MOCK=true?`);
  return (await res.json()).token;
}

async function submit(token, itemId, image) {
  const form = new FormData();
  form.append('file', new Blob([image], { type: 'image/jpeg' }), 'person.jpg');
  const res = await fetch(`${BASE}/try-on/${itemId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`submit failed (${res.status}): ${data.message}`);
  return data.taskId;
}

async function statusOf(task) {
  try {
    const res = await fetch(`${BASE}/try-on/task/${task.id}`, {
      headers: { Authorization: `Bearer ${task.token}` },
    });
    if (!res.ok) return null;
    return (await res.json()).status;
  } catch {
    return null; // transient network error, skip this round
  }
}

async function main() {
  console.log('=== ai-cloth async try-on load test (mock) ===');
  console.log(`runId=${runId}  users=${USERS}  expected max PROCESSING=${CAP}  poll=${POLL_INTERVAL}ms`);

  // Health check before doing anything
  try {
    const res = await fetch(`${BASE}/items`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (e) {
    console.error(`\n[ERROR] Server not reachable at ${BASE} (${e.message}).`);
    console.error('Start it first: WX_MOCK=true DASHSCOPE_MOCK=true DASHSCOPE_MOCK_DELAY=5000 npm run start:dev');
    process.exit(1);
  }

  const stale = await pruneStale();
  if (stale) console.log(`[prep] cleaned ${stale} stale test users from a previous run`);
  const before = await baseline();
  console.log(`[prep] baseline: users=${before.users}, records=${before.records}`);


  const items = await (await fetch(`${BASE}/items`)).json();
  if (!items.length) throw new Error('No items in database - run npm run prisma:seed first');
  const itemId = items[0].id;
  const image = readFileSync(IMAGE_PATH);

  try {
    // 1. Log in N distinct mock users
    process.stdout.write(`[1/3] logging in ${USERS} mock users ... `);
    const tokens = [];
    for (let i = 1; i <= USERS; i++) {
        tokens.push(await login(`${runId}-${i}`));
    }
    console.log('ok');

    // 2. Submit one task per user
    process.stdout.write(`[2/3] submitting ${USERS} try-on tasks ... `);
    const tasks = [];
    for (const token of tokens) {
        const id = await submit(token, itemId, image);
        tasks.push({ id, token });
    }
    console.log(`ok (ids: ${tasks[0].id}..${tasks[tasks.length - 1].id})`);

    // 3. Poll and print snapshots
    console.log('\n[3/3] status snapshots:\n');
    console.log('  t(s)   PENDING   PROCESSING   SUCCESS   FAILED');
    const started = Date.now();
    let peakProcessing = 0;
    let violations = 0;
    let finished = false;

    while (Date.now() - started < MAX_WAIT_MS) {
      await sleep(POLL_INTERVAL);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      const counts = { PENDING: 0, PROCESSING: 0, SUCCESS: 0, FAILED: 0 };
      const statuses = await Promise.all(tasks.map(statusOf));
      for (const s of statuses) {
        if (s && s in counts) counts[s] += 1;
      }
      peakProcessing = Math.max(peakProcessing, counts.PROCESSING);
      if (counts.PROCESSING > CAP) violations += 1;
      console.log(
        `${elapsed.padStart(6)}   ${String(counts.PENDING).padStart(7)}   ` +
        `${String(counts.PROCESSING).padStart(10)}   ${String(counts.SUCCESS).padStart(8)}   ` +
        `${String(counts.FAILED).padStart(7)}`,
      );
      if (counts.PENDING + counts.PROCESSING === 0) {
        finished = true;
        break;
      }
    }

    const totalSec = ((Date.now() - started) / 1000).toFixed(1);
    console.log('\n=== result ===');
    console.log(`elapsed: ${totalSec}s   peak PROCESSING: ${peakProcessing}   cap: ${CAP}`);
    if (!finished) {
      console.log(`TIMEOUT: some tasks still running after ${MAX_WAIT_MS / 1000}s`);
    }
    if (violations > 0) {
      console.log(`FAIL: PROCESSING exceeded ${CAP} in ${violations} snapshot(s)`);
      process.exitCode = 1;
    } else if (finished) {
      console.log(`PASS: concurrency cap respected (never exceeded ${CAP})`);
      console.log(`Note: ${USERS} tasks x 5s would take ~${USERS * 5}s without concurrency; ` +
        `with cap=${CAP} it took ${totalSec}s`);
    }
  } finally {
    const cleaned = await cleanupRun(runId);
    const after = await baseline();
    console.log('\n=== cleanup ===');
    console.log(`removed ${cleaned} test users`);
    console.log(`DB delta: users ${after.users - before.users}, ` +
      `records ${after.records - before.records}  (expected 0 / 0)`);
    await disconnect();
  }
}

main().catch((e) => {
  console.error(`\n[ERROR] ${e.message}`);
  process.exit(1);
});
